import express from 'express';

import { query } from '../db/index.js';
import { verifyPasscode } from '../utils/passcode.js';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../utils/otp.js';
import { sendShareLinkOtpEmail } from '../utils/shareVerificationEmail.js';
import { isValidEmail } from '../utils/validation.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createAccessLogEntry } from '../models/treeAccessLogModel.js';
import { isViewerBlocked } from '../models/treeBlockedViewersModel.js';

// The one deliberately unauthenticated read path in the app - no requireAuth,
// no requireTreeRole. Reachable only by holding a valid share_token, which is
// unguessable (see utils/shareToken.js) and only ever exposed to the tree
// owner via the owner-only GET/PATCH /:id/share-link routes in trees.js.
export const publicTreesRouter = express.Router();

function resolveIp(req) {
  return req?.ip || req?.socket?.remoteAddress || null;
}

async function findViewableTree(shareToken) {
  const { rows: treeRows } = await query(
    `SELECT id, name, status, default_main_id, default_generation_depth,
            link_passcode_hash, require_passcode, require_email_verification
     FROM trees
     WHERE share_token = $1 AND link_access = 'view'`,
    [shareToken]
  );
  const tree = treeRows[0];
  // A wrong/reset token, a tree whose owner flipped link_access back to
  // restricted, and a disabled tree all collapse to the same 404 here -
  // there's no reason to tell an anonymous caller which case it is.
  if (!tree || tree.status === 'disabled') return null;
  return tree;
}

async function loadTreePayload(tree) {
  const { rows: familyDataRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [tree.id]);
  return {
    tree: {
      id: tree.id,
      name: tree.name,
      default_main_id: tree.default_main_id,
      default_generation_depth: tree.default_generation_depth,
    },
    data: familyDataRows[0]?.json_data ?? [],
  };
}

// require_passcode is the enforcement flag; link_passcode_hash existing is a
// separate fact (see design.md decision 2). Both must hold for the gate to
// actually apply - the owner-side PATCH route guarantees require_passcode
// can never be true without a hash, but this stays defensive either way.
function isPasscodeRequired(tree) {
  return Boolean(tree.require_passcode && tree.link_passcode_hash);
}

// Re-checked statelessly on every OTP call (there is no server-side guest
// session) - mirrors how the client already resubmits the raw passcode on
// every reload. Enforces "passcode gate before email gate" from design.md
// decision 3 even against a client that skips straight to the OTP endpoints.
function isPasscodeSatisfied(tree, passcode) {
  if (!isPasscodeRequired(tree)) return true;
  return typeof passcode === 'string' && verifyPasscode(passcode, tree.link_passcode_hash);
}

// 20 requests/hour/IP shared across both OTP endpoints (same limiter
// instance keyed by IP applied to both routes below) - a single source
// rotating through emails still hits this backstop.
const otpIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyFn: (req) => `ip:${resolveIp(req)}`,
});

// 3 requests/15min per (shareToken, email) - the more targeted limit against
// bombing one address with codes.
const otpRequestEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyFn: (req) => `req:${req.params.shareToken}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

// Passcode-protected trees never return data from the plain GET - only a
// { passcode_required, email_verification_required } flag pair, so the tree
// contents stay hidden from anyone who merely has the URL. The frontend then
// walks the required gate(s) (passcode first, then email - see design.md
// decision 3) before fetching the actual data.
publicTreesRouter.get('/:shareToken', async (req, res, next) => {
  try {
    const tree = await findViewableTree(req.params.shareToken);
    if (!tree) return res.status(404).json({ error: 'This link is no longer available' });

    const passcodeRequired = isPasscodeRequired(tree);
    const emailVerificationRequired = Boolean(tree.require_email_verification);

    if (passcodeRequired || emailVerificationRequired) {
      return res.status(401).json({
        error: passcodeRequired ? 'This link is protected by a passcode' : 'This link requires email verification',
        passcode_required: passcodeRequired,
        email_verification_required: emailVerificationRequired,
      });
    }

    return res.json(await loadTreePayload(tree));
  } catch (error) {
    return next(error);
  }
});

publicTreesRouter.post('/:shareToken/verify', async (req, res, next) => {
  try {
    const tree = await findViewableTree(req.params.shareToken);
    if (!tree) return res.status(404).json({ error: 'This link is no longer available' });

    const passcodeRequired = isPasscodeRequired(tree);
    if (passcodeRequired) {
      const { passcode } = req.body || {};
      if (typeof passcode !== 'string' || !verifyPasscode(passcode, tree.link_passcode_hash)) {
        return res.status(403).json({ error: 'Incorrect passcode' });
      }
    }

    // Passcode gate satisfied. If email verification is also required, stop
    // here without tree data - the frontend proceeds to the OTP gate next.
    if (tree.require_email_verification) {
      return res.json({ ok: true, passcode_verified: true, email_verification_required: true });
    }

    return res.json(await loadTreePayload(tree));
  } catch (error) {
    return next(error);
  }
});

publicTreesRouter.post('/:shareToken/otp/request', otpIpLimiter, otpRequestEmailLimiter, async (req, res, next) => {
  try {
    const tree = await findViewableTree(req.params.shareToken);
    if (!tree) return res.status(404).json({ error: 'This link is no longer available' });
    if (!tree.require_email_verification) {
      return res.status(400).json({ error: 'Email verification is not enabled for this link' });
    }

    const { email, passcode } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email address is required' });
    if (!isPasscodeSatisfied(tree, passcode)) return res.status(403).json({ error: 'Incorrect passcode' });

    // From here on, always respond with the same generic success shape
    // regardless of block status or prior history - a blocked (or brand
    // new) email gets an indistinguishable response (spec:
    // tree-access-audit-log "Blocking does not reveal block status").
    const normalizedEmail = email.trim().toLowerCase();
    const blocked = await isViewerBlocked({ treeId: tree.id, email: normalizedEmail });
    if (!blocked) {
      const code = generateOtpCode();
      await query(
        `INSERT INTO otp_codes (share_token, email, code_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '10 minutes')`,
        [req.params.shareToken, normalizedEmail, hashOtpCode(code)]
      );
      await sendShareLinkOtpEmail({ to: normalizedEmail, treeName: tree.name, code });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

publicTreesRouter.post('/:shareToken/otp/verify', otpIpLimiter, async (req, res, next) => {
  try {
    const tree = await findViewableTree(req.params.shareToken);
    if (!tree) return res.status(404).json({ error: 'This link is no longer available' });
    if (!tree.require_email_verification) {
      return res.status(400).json({ error: 'Email verification is not enabled for this link' });
    }

    const { email, code, passcode } = req.body || {};
    if (!isValidEmail(email) || typeof code !== 'string') {
      return res.status(400).json({ error: 'Email and code are required' });
    }
    if (!isPasscodeSatisfied(tree, passcode)) return res.status(403).json({ error: 'Incorrect passcode' });

    const genericInvalid = () => res.status(403).json({ error: 'Incorrect or expired code' });
    const normalizedEmail = email.trim().toLowerCase();

    // Checked here (not just in otp/request) so a blocked guest who somehow
    // still has a valid code from before the block can't complete
    // verification either - only the response has to stay generic, not the
    // outcome.
    const blocked = await isViewerBlocked({ treeId: tree.id, email: normalizedEmail });
    if (blocked) return genericInvalid();

    const { rows } = await query(
      `SELECT id, code_hash, failed_attempts, expires_at, consumed_at
       FROM otp_codes
       WHERE share_token = $1 AND lower(email) = $2
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.shareToken, normalizedEmail]
    );
    const otpRow = rows[0];
    if (!otpRow) return genericInvalid();

    // Once verified, a code stays valid for the rest of the browser session
    // (client resubmits it from sessionStorage, same pattern as the passcode
    // gate) so a reload doesn't force a fresh email round-trip - only the
    // first-time attempt is bound by expiry and the failed-attempt cap.
    const alreadyVerified = Boolean(otpRow.consumed_at);
    if (!alreadyVerified) {
      if (new Date(otpRow.expires_at).getTime() < Date.now()) return genericInvalid();
      if (otpRow.failed_attempts >= 5) return genericInvalid();
    }

    if (!verifyOtpCode(code, otpRow.code_hash)) {
      if (!alreadyVerified) {
        await query('UPDATE otp_codes SET failed_attempts = failed_attempts + 1 WHERE id = $1', [otpRow.id]);
      }
      return genericInvalid();
    }

    if (!alreadyVerified) {
      await query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [otpRow.id]);
    }

    await createAccessLogEntry({
      treeId: tree.id,
      viewerEmail: normalizedEmail,
      ipAddress: resolveIp(req),
      shareToken: req.params.shareToken,
      userAgent: req.headers['user-agent'] || null,
    });

    return res.json(await loadTreePayload(tree));
  } catch (error) {
    return next(error);
  }
});
