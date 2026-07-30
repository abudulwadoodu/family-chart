import express from 'express';
import multer from 'multer';

import { query, withTransaction } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString, isValidEmail, capitalizeFirst } from '../utils/validation.js';
import { getDefaultTreeDataJson } from '../utils/defaultTreeData.js';
import { parseCsvText, buildRawRows, csvRowsToDomain } from '../utils/csv/index.js';
import { parseJsonText, jsonExportToDomain, validateJsonPeople, domainToJsonExport } from '../utils/json/index.js';
import { findUserByEmail } from '../models/userModel.js';
import { findTreesMatchingUserEmail } from '../models/emailMatchModel.js';
import { parseGedcom, validateGedcom, gedcomToDomain, writeGedcom } from '../utils/gedcom/index.js';
import {
  JoinRequestError,
  searchDiscoverableTrees,
  createJoinRequest,
  createRoleChangeRequest,
  getPendingRequestsForOwner,
  getSentRequestsForUser,
  decideJoinRequest,
} from '../models/joinRequestModel.js';
import {
  sendJoinRequestCreatedEmail,
  sendJoinRequestDecidedEmail,
  sendRoleChangeRequestCreatedEmail,
} from '../utils/joinRequestEmail.js';
import { recordActivity, ACTIVITY_TYPES } from '../services/activity.js';
import { MemberClaimError, proposeClaim, getPendingClaimsForOwner, getSentClaimsForUser, decideClaim } from '../models/memberClaimModel.js';
import { generateShareToken } from '../utils/shareToken.js';

const JOIN_REQUEST_ERROR_RESPONSES = {
  ALREADY_MEMBER: { status: 409, message: 'You already have access to this tree' },
  ALREADY_PENDING: { status: 409, message: 'You already have a pending request for this tree' },
  NOT_FOUND: { status: 404, message: 'Join request not found' },
  FORBIDDEN: { status: 403, message: 'You do not own this tree' },
  ALREADY_DECIDED: { status: 409, message: 'This request has already been decided' },
  NOT_A_MEMBER: { status: 403, message: 'You must be a member of this tree to request a different role' },
  OWNER_CANNOT_REQUEST: { status: 400, message: 'Owners cannot request a role change on their own tree' },
  SAME_ROLE: { status: 400, message: 'You already have this role' },
};

function handleJoinRequestError(error, res, next) {
  if (error instanceof JoinRequestError) {
    const mapped = JOIN_REQUEST_ERROR_RESPONSES[error.code];
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
  }
  return next(error);
}

const MEMBER_CLAIM_ERROR_RESPONSES = {
  MEMBER_NOT_FOUND: { status: 404, message: 'That person is not part of this tree' },
  ALREADY_APPROVED: { status: 409, message: 'You already have an approved claim on this person' },
  ALREADY_CLAIMED_ELSEWHERE_IN_TREE: { status: 409, message: 'You already have an approved claim on a different person in this tree' },
  ALREADY_PENDING: { status: 409, message: 'You already have a pending claim on this person' },
  NOT_FOUND: { status: 404, message: 'Claim not found' },
  FORBIDDEN: { status: 403, message: 'You do not own this tree' },
  ALREADY_DECIDED: { status: 409, message: 'This claim has already been decided' },
  MEMBER_NO_LONGER_EXISTS: { status: 410, message: 'This person no longer exists in the tree' },
  MEMBER_ALREADY_CLAIMED: { status: 409, message: 'Someone else has already been approved as this person' },
  USER_ALREADY_CLAIMED_ELSEWHERE: { status: 409, message: 'This user already has an approved claim on a different person in this tree' },
};

function handleMemberClaimError(error, res, next) {
  if (error instanceof MemberClaimError) {
    const mapped = MEMBER_CLAIM_ERROR_RESPONSES[error.code];
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
  }
  return next(error);
}

const ASSIGNABLE_ROLES = ['editor', 'viewer'];

export const treesRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

treesRouter.use(requireAuth);

// Upserts family_data.json_data (JSONB) for a tree, matching the shared
// "import overwrites the whole tree" behavior used by import-csv/import-json/
// import-gedcom and the plain PUT /:id save.
async function upsertFamilyData(treeId, people) {
  await query(
    `INSERT INTO family_data (tree_id, json_data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT(tree_id) DO UPDATE SET json_data = excluded.json_data, updated_at = excluded.updated_at`,
    [treeId, JSON.stringify(people)]
  );
}

treesRouter.get('/', async (req, res, next) => {
  try {
    const { rows: trees } = await query(
      `SELECT t.id, t.name, t.owner_id, t.created_at, t.status, tp.role,
              COALESCE(fd.updated_at, t.created_at) AS updated_at,
              COALESCE(jsonb_array_length(fd.json_data), 0) AS member_count
       FROM trees t
       JOIN tree_permissions tp ON tp.tree_id = t.id
       LEFT JOIN family_data fd ON fd.tree_id = t.id
       WHERE tp.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    return res.json({ trees });
  } catch (error) {
    return next(error);
  }
});

treesRouter.post('/', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!isNonEmptyString(name, 120)) {
      return res.status(400).json({ error: 'Tree name is required' });
    }

    const userId = req.user.id;
    const trimmedName = capitalizeFirst(name.trim());
    const initialPeople = JSON.parse(getDefaultTreeDataJson());

    const treeId = await withTransaction(async (client) => {
      const treeResult = await client.query('INSERT INTO trees (name, owner_id) VALUES ($1, $2) RETURNING id', [
        trimmedName,
        userId,
      ]);
      const id = treeResult.rows[0].id;

      await client.query(
        "INSERT INTO tree_permissions (tree_id, user_id, role, updated_at) VALUES ($1, $2, 'owner', NOW())",
        [id, userId]
      );
      await client.query('INSERT INTO family_data (tree_id, json_data, updated_at) VALUES ($1, $2, NOW())', [
        id,
        JSON.stringify(initialPeople),
      ]);
      return id;
    });

    return res.status(201).json({ id: treeId, name: trimmedName });
  } catch (error) {
    return next(error);
  }
});

// Parses, validates, and maps a GEDCOM file without persisting anything -
// the "Validation" and "Preview" steps of the import wizard both read off
// this response. Not scoped to a tree id because at this point the user
// may not have picked (or created) a target tree yet.
treesRouter.post('/gedcom/preview', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'GEDCOM file is required' });

    const gedcomText = req.file.buffer.toString('utf8');
    const { records } = parseGedcom(gedcomText);
    const validation = validateGedcom(records);
    const { people, summary, warnings: mapperWarnings } = gedcomToDomain(records, {});
    const warnings = [...validation.warnings, ...mapperWarnings];

    return res.json({
      ok: validation.errors.length === 0,
      errors: validation.errors,
      warnings,
      summary: { ...summary, warningCount: warnings.length, errorCount: validation.errors.length },
      people,
    });
  } catch (error) {
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    return next(error);
  }
});

// Parses, validates, and maps a CSV file without persisting anything -
// mirrors /gedcom/preview so the CSV import panel can show warnings/row
// numbers before the user confirms the import.
treesRouter.post('/csv/preview', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'CSV file is required' });

    const csvText = req.file.buffer.toString('utf8');
    const parsed = parseCsvText(csvText);
    const rawRows = buildRawRows(parsed);
    const { people, errors, warnings, summary } = csvRowsToDomain(rawRows);

    return res.json({ ok: errors.length === 0, errors, warnings, summary, people });
  } catch (error) {
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    return next(error);
  }
});

// Same idea for JSON: parses (auto-detecting legacy bare-array vs versioned
// envelope), validates, and returns the mapped people without persisting.
treesRouter.post('/json/preview', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'JSON file is required' });

    const jsonText = req.file.buffer.toString('utf8');
    const parsed = parseJsonText(jsonText);
    const { people: mapped, warnings: mapWarnings } = jsonExportToDomain(parsed);
    const { errors, warnings: validationWarnings, cleanedPeople } = validateJsonPeople(mapped);
    const warnings = [...mapWarnings, ...validationWarnings];

    return res.json({
      ok: errors.length === 0,
      errors,
      warnings,
      summary: { rowCount: mapped.length, importedCount: cleanedPeople.length, warningCount: warnings.length },
      people: cleanedPeople,
    });
  } catch (error) {
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    return next(error);
  }
});

// Discoverable-tree search for the "search before you create" flow. Must be
// registered before GET /:id so Express doesn't treat "search" as a tree id.
treesRouter.get('/search', async (req, res, next) => {
  try {
    const searchTerm = String(req.query.query || '').trim();
    if (!isNonEmptyString(searchTerm, 120)) {
      return res.status(400).json({ error: 'A search query is required' });
    }

    const trees = await searchDiscoverableTrees(searchTerm, req.user.id);
    return res.json({ trees });
  } catch (error) {
    return next(error);
  }
});

// Incoming pending join requests across every tree this user owns. Must also
// be registered before GET /:id for the same reason as /search above.
treesRouter.get('/manage-requests', async (req, res, next) => {
  try {
    const requests = await getPendingRequestsForOwner(req.user.id);
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
});

// Every request this user has sent (any status) - lets a requester see
// whether their request is still pending, was approved, or was rejected,
// since rejection otherwise leaves no trace in the search results (a
// rejected tree just goes back to showing "Request to Join"). Must also be
// registered before GET /:id for the same reason as /search above.
treesRouter.get('/my-requests', async (req, res, next) => {
  try {
    const requests = await getSentRequestsForUser(req.user.id);
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
});

// "Trees you may belong to" - person-nodes in some tree's family_data have a
// data.email matching this user's own users.email, but they're not a member
// and have no pending request yet. Recomputed on every call (not a one-time
// "seen it" flag) so it also catches matches created later (e.g. an owner
// adds someone's email after the fact). Dismissal of an individual card is
// entirely client-side (localStorage) - see frontend/main.js. Must also be
// registered before GET /:id for the same reason as /search above.
treesRouter.get('/discovery', async (req, res, next) => {
  try {
    const trees = await findTreesMatchingUserEmail(req.user.email, req.user.id);
    return res.json({ trees });
  } catch (error) {
    return next(error);
  }
});

// Owner decision on a join request (approve/reject). Scoped at the top
// level (not under /:id) since the request id alone is enough to resolve
// the tree and ownership check happens inside decideJoinRequest.
treesRouter.patch('/requests/:id', async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const { status } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be either approved or rejected' });
    }

    const updated = await decideJoinRequest(requestId, req.user.id, status);

    try {
      await sendJoinRequestDecidedEmail({
        senderEmail: updated.sender_email,
        ownerEmail: req.user.email,
        treeName: updated.tree_name,
        roleRequested: updated.role_requested,
        decision: status,
        requestType: updated.request_type,
      });
    } catch (emailError) {
      console.error('Failed to send join request decision email:', emailError);
    }

    return res.json({ ok: true, request: updated });
  } catch (error) {
    return handleJoinRequestError(error, res, next);
  }
});

// Pending member claims across every tree this user owns - "who wants to be
// linked as a specific person in my tree". Must also be registered before
// GET /:id for the same reason as /search above.
treesRouter.get('/manage-claims', async (req, res, next) => {
  try {
    const claims = await getPendingClaimsForOwner(req.user.id);
    return res.json({ claims });
  } catch (error) {
    return next(error);
  }
});

// Every claim this user has proposed (any status) - mirrors /my-requests.
// Must also be registered before GET /:id for the same reason as /search above.
treesRouter.get('/my-claims', async (req, res, next) => {
  try {
    const claims = await getSentClaimsForUser(req.user.id);
    return res.json({ claims });
  } catch (error) {
    return next(error);
  }
});

// A tree member proposes "this person is me" on a node they don't yet have
// an approved claim on. Requires existing tree access (any role) - this is
// about identity within a tree the caller can already see, not about
// gaining access (that's /:id/request-join). Always lands 'pending'; only
// an owner's decision below can approve it.
treesRouter.post('/:id/claims', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { member_id: memberId, message } = req.body || {};
    if (!isNonEmptyString(memberId, 200)) {
      return res.status(400).json({ error: 'member_id is required' });
    }
    if (typeof message !== 'undefined' && message !== null && !isNonEmptyString(message, 500) && message !== '') {
      return res.status(400).json({ error: 'Message must be 500 characters or fewer' });
    }

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const claim = await proposeClaim(treeId, req.user.id, memberId, trimmedMessage || null);
    return res.status(201).json({ ok: true, claim });
  } catch (error) {
    return handleMemberClaimError(error, res, next);
  }
});

// Owner decision on a member claim (approve/reject). Scoped at the top
// level (not under /:id) since the claim id alone is enough to resolve the
// tree and ownership check happens inside decideClaim - same shape as
// PATCH /requests/:id above.
treesRouter.patch('/claims/:claimId', async (req, res, next) => {
  try {
    const claimId = Number(req.params.claimId);
    const { status } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be either approved or rejected' });
    }

    const updated = await decideClaim(claimId, req.user.id, status);
    return res.json({ ok: true, claim: updated });
  } catch (error) {
    return handleMemberClaimError(error, res, next);
  }
});

treesRouter.get('/:id', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { rows: treeRows } = await query(
      'SELECT id, name, owner_id, created_at, status, default_main_id, default_generation_depth, email_auto_visibility FROM trees WHERE id = $1',
      [treeId]
    );
    const { rows: familyDataRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [treeId]);

    const tree = treeRows[0];
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    return res.json({
      tree,
      role: req.treePermission.role,
      memberId: req.treePermission.member_id,
      claimStatus: req.treePermission.claim_status,
      data: familyDataRows[0]?.json_data ?? [],
    });
  } catch (error) {
    return next(error);
  }
});

treesRouter.put('/:id', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { json_data: jsonData } = req.body || {};

    if (typeof jsonData === 'undefined') {
      return res.status(400).json({ error: 'json_data is required' });
    }

    // Diff against the pre-save member list to log newly-added members for
    // the Family Feed. Only additions are detected (ids present in the new
    // payload but not the old) - this is a whole-tree overwrite, not a
    // per-field diff, so edits/removals can't be reliably distinguished and
    // aren't logged. Import routes (CSV/JSON/GEDCOM) deliberately skip this -
    // they'd otherwise flood the feed with one row per imported person.
    const { rows: existingRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [treeId]);
    const previousIds = new Set((existingRows[0]?.json_data ?? []).map((person) => person.id));

    await upsertFamilyData(treeId, jsonData);

    if (Array.isArray(jsonData)) {
      const newIds = jsonData.filter((person) => !previousIds.has(person.id)).map((person) => person.id);
      for (const memberId of newIds) {
        await recordActivity(req, { activityType: ACTIVITY_TYPES.MEMBER_ADDED, memberId });
      }
    }

    return res.json({ ok: true, changes: 1 });
  } catch (error) {
    return next(error);
  }
});

treesRouter.patch('/:id', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!isNonEmptyString(name, 120)) {
      return res.status(400).json({ error: 'Tree name is required' });
    }

    const treeId = Number(req.params.id);
    const trimmedName = capitalizeFirst(name.trim());
    await query('UPDATE trees SET name = $1 WHERE id = $2', [trimmedName, treeId]);

    return res.json({ ok: true, name: trimmedName });
  } catch (error) {
    return next(error);
  }
});

const MIN_GENERATION_DEPTH = 1;
const MAX_GENERATION_DEPTH = 20;

function isValidGenerationDepth(value) {
  return Number.isInteger(value) && value >= MIN_GENERATION_DEPTH && value <= MAX_GENERATION_DEPTH;
}

// Owner-only tree settings distinct from the name-only PATCH /:id above -
// the default focus person (Focused mode's initial main_id for anyone
// opening the tree) and the default generation depth (how many generations
// of ancestry/progeny Focused mode renders before trimming - see
// setAncestryDepth/setProgenyDepth in frontend/main.js's renderChart()).
// Kept on its own route so the settings tab doesn't need to resend the tree
// name just to change one setting, and vice versa for the rename form.
//
// Each setting is independently optional: a key that's absent from the body
// is left untouched, so the frontend (or any other caller) can update just
// one without having to know/resend the other's current value. `null` is a
// meaningful value for both (no default person / unlimited depth), so
// "absent" and "explicitly null" are deliberately different.
treesRouter.patch('/:id/settings', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const body = req.body || {};
    const hasDefaultMainId = Object.prototype.hasOwnProperty.call(body, 'default_main_id');
    const hasGenerationDepth = Object.prototype.hasOwnProperty.call(body, 'default_generation_depth');
    const hasEmailAutoVisibility = Object.prototype.hasOwnProperty.call(body, 'email_auto_visibility');
    const defaultMainId = body.default_main_id;
    const defaultGenerationDepth = body.default_generation_depth;
    const emailAutoVisibility = body.email_auto_visibility;

    if (hasDefaultMainId && defaultMainId !== null && !isNonEmptyString(defaultMainId, 200)) {
      return res.status(400).json({ error: 'default_main_id must be a person id or null' });
    }

    if (hasDefaultMainId && defaultMainId !== null) {
      const { rows: familyDataRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [treeId]);
      const people = familyDataRows[0]?.json_data ?? [];
      const exists = Array.isArray(people) && people.some((person) => person.id === defaultMainId);
      if (!exists) {
        return res.status(400).json({ error: 'default_main_id must refer to a member of this tree' });
      }
    }

    if (hasGenerationDepth && defaultGenerationDepth !== null && !isValidGenerationDepth(defaultGenerationDepth)) {
      return res
        .status(400)
        .json({ error: `default_generation_depth must be an integer between ${MIN_GENERATION_DEPTH} and ${MAX_GENERATION_DEPTH}, or null` });
    }

    if (hasEmailAutoVisibility && typeof emailAutoVisibility !== 'boolean') {
      return res.status(400).json({ error: 'email_auto_visibility must be a boolean' });
    }

    if (!hasDefaultMainId && !hasGenerationDepth && !hasEmailAutoVisibility) {
      return res.status(400).json({
        error: 'At least one setting (default_main_id, default_generation_depth, or email_auto_visibility) is required',
      });
    }

    const { rows } = await query(
      `UPDATE trees SET
         default_main_id = CASE WHEN $1 THEN $2 ELSE default_main_id END,
         default_generation_depth = CASE WHEN $3 THEN $4 ELSE default_generation_depth END,
         email_auto_visibility = CASE WHEN $5 THEN $6 ELSE email_auto_visibility END
       WHERE id = $7
       RETURNING default_main_id, default_generation_depth, email_auto_visibility`,
      [
        hasDefaultMainId,
        defaultMainId ?? null,
        hasGenerationDepth,
        defaultGenerationDepth ?? null,
        hasEmailAutoVisibility,
        emailAutoVisibility ?? false,
        treeId,
      ]
    );

    return res.json({ ok: true, ...rows[0] });
  } catch (error) {
    return next(error);
  }
});

const LINK_ACCESS_VALUES = ['restricted', 'view'];

// Owner-only read of the current link-sharing config, kept separate from the
// public GET /:id (reachable by every role incl. viewers) since the raw
// share_token must stay owner-only - anyone holding it gets read access.
treesRouter.get('/:id/share-link', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { rows } = await query('SELECT share_token, link_access FROM trees WHERE id = $1', [treeId]);
    return res.json({ share_token: rows[0].share_token, link_access: rows[0].link_access });
  } catch (error) {
    return next(error);
  }
});

// Toggles anonymous read-only link access on/off. Turning it on lazily
// generates share_token the first time (it starts NULL - see migration 014)
// rather than requiring a separate provisioning step; turning it back off
// leaves the token in place (unused while restricted) so re-enabling later
// doesn't silently change a link someone may have already been given.
treesRouter.patch('/:id/share-link', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { link_access: linkAccess } = req.body || {};
    if (!LINK_ACCESS_VALUES.includes(linkAccess)) {
      return res.status(400).json({ error: "link_access must be either 'restricted' or 'view'" });
    }

    const { rows: treeRows } = await query('SELECT share_token FROM trees WHERE id = $1', [treeId]);
    const needsToken = linkAccess === 'view' && !treeRows[0].share_token;
    const shareToken = needsToken ? generateShareToken() : treeRows[0].share_token;

    const { rows } = await query(
      `UPDATE trees SET link_access = $1, share_token = COALESCE(share_token, $2) WHERE id = $3
       RETURNING share_token, link_access`,
      [linkAccess, shareToken, treeId]
    );

    return res.json({ ok: true, share_token: rows[0].share_token, link_access: rows[0].link_access });
  } catch (error) {
    return next(error);
  }
});

// Regenerates share_token, immediately invalidating any previously-shared
// link (the public GET below looks up trees by share_token, so the old value
// simply stops matching anything once overwritten).
treesRouter.post('/:id/share-link/reset', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const shareToken = generateShareToken();
    const { rows } = await query('UPDATE trees SET share_token = $1 WHERE id = $2 RETURNING share_token, link_access', [
      shareToken,
      treeId,
    ]);
    return res.json({ ok: true, share_token: rows[0].share_token, link_access: rows[0].link_access });
  } catch (error) {
    return next(error);
  }
});

// Owner self-service disable/enable, mirroring the admin moderation action at
// PATCH /api/admin/trees/:id/status (same trees.status column, same
// 'active'/'disabled' values). Deliberately does NOT use requireTreeRole -
// that middleware 403s every role (owner included) once a tree is disabled,
// which would permanently lock an owner out of their own tree with no way
// back in. Ownership is checked directly against trees.owner_id instead, so
// disabling and re-enabling both stay reachable regardless of current status.
treesRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { status } = req.body || {};
    if (!['active', 'disabled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const { rows: treeRows } = await query('SELECT id, owner_id FROM trees WHERE id = $1', [treeId]);
    const tree = treeRows[0];
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (tree.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the tree owner can change its status' });

    const { rows } = await query('UPDATE trees SET status = $1 WHERE id = $2 RETURNING id, name, status', [
      status,
      treeId,
    ]);

    return res.json({ ok: true, tree: rows[0] });
  } catch (error) {
    return next(error);
  }
});

treesRouter.delete('/:id', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);

    const { rows } = await query('SELECT id FROM trees WHERE id = $1', [treeId]);
    if (!rows[0]) return res.status(404).json({ error: 'Tree not found' });

    await query('DELETE FROM trees WHERE id = $1', [treeId]);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

treesRouter.post(
  '/:id/import-csv',
  requireTreeRole(['owner', 'editor']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) return res.status(400).json({ error: 'CSV file is required' });
      const csvText = req.file.buffer.toString('utf8');
      const parsed = parseCsvText(csvText);
      const rawRows = buildRawRows(parsed);
      const { people, errors, warnings } = csvRowsToDomain(rawRows);
      if (errors.length > 0) return res.status(400).json({ error: errors[0].message, errors });

      const treeId = Number(req.params.id);
      await upsertFamilyData(treeId, people);

      return res.json({ ok: true, imported_count: people.length, warnings });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ error: error.message });
      return next(error);
    }
  }
);

treesRouter.post(
  '/:id/import-json',
  requireTreeRole(['owner', 'editor']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) return res.status(400).json({ error: 'JSON file is required' });
      const jsonText = req.file.buffer.toString('utf8');
      const parsed = parseJsonText(jsonText);
      const { people: mapped, warnings: mapWarnings } = jsonExportToDomain(parsed);
      const { errors, warnings: validationWarnings, cleanedPeople } = validateJsonPeople(mapped);
      if (errors.length > 0) return res.status(400).json({ error: errors[0].message, errors });
      const warnings = [...mapWarnings, ...validationWarnings];

      const treeId = Number(req.params.id);
      await upsertFamilyData(treeId, cleanedPeople);

      return res.json({ ok: true, imported_count: cleanedPeople.length, warnings });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ error: error.message });
      return next(error);
    }
  }
);

// Commit step of the GEDCOM import wizard: re-accepts the file (rather than
// trusting a client-submitted domain blob) and re-runs parse+map server-side.
// Matches the existing import-csv/import-json behavior: the GEDCOM file's
// people become the tree's entire contents, whether the target is a freshly
// created tree or one that already has data in it. "Create new tree" is
// handled by the frontend calling POST / first and then this route against
// the freshly created tree id.
treesRouter.post(
  '/:id/import-gedcom',
  requireTreeRole(['owner', 'editor']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) return res.status(400).json({ error: 'GEDCOM file is required' });

      let options = {};
      if (req.body?.options) {
        try {
          options = JSON.parse(req.body.options);
        } catch (_error) {
          return res.status(400).json({ error: 'options must be valid JSON' });
        }
      }

      const gedcomText = req.file.buffer.toString('utf8');
      const { records } = parseGedcom(gedcomText);
      const { people: importedPeople, warnings } = gedcomToDomain(records, options);
      const treeId = Number(req.params.id);

      await upsertFamilyData(treeId, importedPeople);

      return res.json({ ok: true, imported_count: importedPeople.length, skipped_count: 0, added_ids: importedPeople.map((p) => p.id), warnings });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ error: error.message });
      return next(error);
    }
  }
);

// GEDCOM generation (FAM synthesis, CONC/CONT folding, export filters) lives
// once in utils/gedcom rather than being duplicated in frontend JS. Returns
// the GEDCOM text as JSON (not a raw file response) so the frontend can keep
// using its existing JSON-only `api()` helper and build the download blob
// itself.
treesRouter.get('/:id/export-gedcom', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { rows: treeRows } = await query('SELECT id FROM trees WHERE id = $1', [treeId]);
    if (!treeRows[0]) return res.status(404).json({ error: 'Tree not found' });

    const { rows: familyDataRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [treeId]);
    const people = familyDataRows[0]?.json_data ?? [];

    const options = {
      includeNotes: req.query.includeNotes !== 'false',
      includePrivate: req.query.includePrivate !== 'false',
      includeDeceased: req.query.includeDeceased !== 'false',
      includeLiving: req.query.includeLiving !== 'false',
    };

    const gedcom = writeGedcom(people, options);
    return res.json({ ok: true, gedcom });
  } catch (error) {
    return next(error);
  }
});

// The versioned JSON envelope's nested schema (birth/death/relationships/
// contact) lives once in utils/json rather than being duplicated in
// frontend JS, matching the export-gedcom precedent above.
treesRouter.get('/:id/export-json', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { rows: treeRows } = await query('SELECT id, name FROM trees WHERE id = $1', [treeId]);
    const tree = treeRows[0];
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const { rows: familyDataRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [treeId]);
    const people = familyDataRows[0]?.json_data ?? [];

    const envelope = domainToJsonExport(people, { treeName: tree.name });
    return res.json({ ok: true, envelope });
  } catch (error) {
    return next(error);
  }
});

// Any authenticated user may request to join a discoverable tree - unlike
// the tree-scoped routes above, this deliberately doesn't use
// requireTreeRole, since the whole point is that the requester isn't a
// member yet.
treesRouter.post('/:id/request-join', async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { role, message } = req.body || {};

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be either editor or viewer' });
    }
    if (typeof message !== 'undefined' && message !== null && !isNonEmptyString(message, 500) && message !== '') {
      return res.status(400).json({ error: 'Message must be 500 characters or fewer' });
    }

    const { rows: treeRows } = await query(
      `SELECT t.id, t.name, t.is_discoverable, u.email AS owner_email
       FROM trees t JOIN users u ON u.id = t.owner_id
       WHERE t.id = $1`,
      [treeId]
    );
    const tree = treeRows[0];
    if (!tree || !tree.is_discoverable) return res.status(404).json({ error: 'Tree not found' });

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const joinRequest = await createJoinRequest(treeId, req.user.id, role, trimmedMessage || null);

    try {
      await sendJoinRequestCreatedEmail({
        ownerEmail: tree.owner_email,
        senderEmail: req.user.email,
        treeName: tree.name,
        roleRequested: role,
        message: trimmedMessage,
      });
    } catch (emailError) {
      console.error('Failed to send join request email:', emailError);
    }

    return res.status(201).json({ ok: true, request: joinRequest });
  } catch (error) {
    return handleJoinRequestError(error, res, next);
  }
});

// A visitor who opened a tree via its public share link, then signed in/up
// to ask for real (editor) access. Deliberately does NOT check
// is_discoverable like /request-join above - a link-shared tree may never be
// listed in search at all. Instead it checks link_access = 'view', which
// proves the requester could only have reached this tree by holding a valid
// share link (or already being a member/owner) in the first place. Reuses
// the same createJoinRequest model call as /request-join, so link-originated
// requests land in the owner's existing Pending Requests view for free.
treesRouter.post('/:id/request-join-via-link', async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { message } = req.body || {};

    if (typeof message !== 'undefined' && message !== null && !isNonEmptyString(message, 500) && message !== '') {
      return res.status(400).json({ error: 'Message must be 500 characters or fewer' });
    }

    const { rows: treeRows } = await query(
      `SELECT t.id, t.name, t.link_access, u.email AS owner_email
       FROM trees t JOIN users u ON u.id = t.owner_id
       WHERE t.id = $1`,
      [treeId]
    );
    const tree = treeRows[0];
    if (!tree || tree.link_access !== 'view') return res.status(404).json({ error: 'Tree not found' });

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const joinRequest = await createJoinRequest(treeId, req.user.id, 'editor', trimmedMessage || null);

    try {
      await sendJoinRequestCreatedEmail({
        ownerEmail: tree.owner_email,
        senderEmail: req.user.email,
        treeName: tree.name,
        roleRequested: 'editor',
        message: trimmedMessage,
      });
    } catch (emailError) {
      console.error('Failed to send join request email:', emailError);
    }

    return res.status(201).json({ ok: true, request: joinRequest });
  } catch (error) {
    return handleJoinRequestError(error, res, next);
  }
});

// An existing member asking the owner to change their role (e.g. viewer ->
// editor). Uses requireTreeRole(['viewer', 'editor']) rather than the
// membership-lookup-then-404 shape of /request-join above, since here the
// caller must already be a non-owner member - that's exactly what the
// middleware already enforces (403 for non-members and owners alike).
treesRouter.post('/:id/request-role-change', requireTreeRole(['viewer', 'editor']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { role, message } = req.body || {};

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be either editor or viewer' });
    }
    if (typeof message !== 'undefined' && message !== null && !isNonEmptyString(message, 500) && message !== '') {
      return res.status(400).json({ error: 'Message must be 500 characters or fewer' });
    }

    const { rows: treeRows } = await query(
      `SELECT t.id, t.name, u.email AS owner_email
       FROM trees t JOIN users u ON u.id = t.owner_id
       WHERE t.id = $1`,
      [treeId]
    );
    const tree = treeRows[0];
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const roleChangeRequest = await createRoleChangeRequest(treeId, req.user.id, role, trimmedMessage || null);

    try {
      await sendRoleChangeRequestCreatedEmail({
        ownerEmail: tree.owner_email,
        senderEmail: req.user.email,
        treeName: tree.name,
        currentRole: req.treePermission.role,
        roleRequested: role,
        message: trimmedMessage,
      });
    } catch (emailError) {
      console.error('Failed to send role change request email:', emailError);
    }

    return res.status(201).json({ ok: true, request: roleChangeRequest });
  } catch (error) {
    return handleJoinRequestError(error, res, next);
  }
});

// Loosened from owner-only to owner+editor: editors need this to populate
// the media/event visibility picker's "specific people" checklist. Viewers
// don't get it - they can't create media/events at all (POST routes are
// owner/editor-only), so never need to pick who to share with. The
// owner-only management actions (share/role-change/remove below) are
// untouched - only this read stays loosened.
treesRouter.get('/:id/permissions', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { rows: permissions } = await query(
      `SELECT tp.id, tp.tree_id, tp.user_id, tp.role, tp.created_at, tp.updated_at, u.email
       FROM tree_permissions tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.tree_id = $1
       ORDER BY tp.created_at ASC`,
      [treeId]
    );
    return res.json({ permissions });
  } catch (error) {
    return next(error);
  }
});

treesRouter.post('/:id/share', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { email, role } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be either editor or viewer' });
    }

    const targetUser = await findUserByEmail(email.trim().toLowerCase());
    if (!targetUser) {
      return res.status(404).json({ error: 'No user found with that email. They need to sign in at least once first.' });
    }

    if (targetUser.id === req.user.id) {
      return res.status(400).json({ error: 'You already own this tree' });
    }

    const { rows: existingRows } = await query('SELECT id FROM tree_permissions WHERE tree_id = $1 AND user_id = $2', [
      treeId,
      targetUser.id,
    ]);
    if (existingRows[0]) {
      return res.status(409).json({ error: 'This user already has access to this tree' });
    }

    await query(
      `INSERT INTO tree_permissions (tree_id, user_id, role, updated_at)
       VALUES ($1, $2, $3, NOW())`,
      [treeId, targetUser.id, role]
    );

    return res.status(201).json({ ok: true, email: targetUser.email, role });
  } catch (error) {
    return next(error);
  }
});

treesRouter.put('/:id/share/:userId', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const { role } = req.body || {};

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be either editor or viewer' });
    }

    const { rows } = await query('SELECT id, role FROM tree_permissions WHERE tree_id = $1 AND user_id = $2', [
      treeId,
      targetUserId,
    ]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: 'Permission not found' });
    if (target.role === 'owner') {
      return res.status(400).json({ error: "The owner's role cannot be changed" });
    }

    await query('UPDATE tree_permissions SET role = $1, updated_at = NOW() WHERE id = $2', [role, target.id]);

    return res.json({ ok: true, role });
  } catch (error) {
    return next(error);
  }
});

treesRouter.delete('/:id/share/:userId', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);

    const { rows } = await query('SELECT id, role FROM tree_permissions WHERE tree_id = $1 AND user_id = $2', [
      treeId,
      targetUserId,
    ]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: 'Permission not found' });
    if (target.role === 'owner') {
      return res.status(400).json({ error: 'Owners cannot remove their own access' });
    }

    // A removed collaborator can no longer reach any media/events endpoint
    // for this tree (requireTreeRole 403s them regardless), so these rows
    // are already unreachable - purged anyway so a "who has access" view
    // over media_shares/event_shares never shows a stale grant to someone
    // with no tree access at all.
    await withTransaction(async (client) => {
      await client.query('DELETE FROM tree_permissions WHERE id = $1', [target.id]);
      await client.query('DELETE FROM media_shares WHERE tree_id = $1 AND user_id = $2', [treeId, targetUserId]);
      await client.query('DELETE FROM event_shares WHERE tree_id = $1 AND user_id = $2', [treeId, targetUserId]);
    });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
