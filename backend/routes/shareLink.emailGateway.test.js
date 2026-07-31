import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

import { setBaseTestEnv, resetDb } from '../test/testEnv.js';

setBaseTestEnv();

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({
      verify: async (token) => {
        if (token === 'invalid-token') throw new Error('invalid token');
        const [sub, email] = token.split('::');
        return { sub, email };
      },
    }),
  },
}));

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
  SendRawEmailCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

const { app } = await import('../app.js');
const { query } = await import('../db/index.js');
const { resetRateLimits } = await import('../middleware/rateLimit.js');

function authHeader(sub, email) {
  return `Bearer ${sub}::${email}`;
}

async function asUser(sub, email) {
  await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return authHeader(sub, email);
}

async function setupTreeWithEmailVerification(owner, { passcode } = {}) {
  const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
  const body = { link_access: 'view', requireEmailVerification: true };
  if (passcode) body.passcode = passcode;
  const res = await request(app).patch(`/api/trees/${treeId}/share-link`).set('Authorization', owner).send(body);
  return { treeId, token: res.body.share_token };
}

// Reads the 6-digit code out of the most recently "sent" (mocked) OTP email's
// raw MIME body - there's no other way for a test to learn the code, since
// only its salted hash is ever persisted (see backend/utils/otp.js).
function extractLastOtpCode() {
  const lastCall = sendMock.mock.calls.at(-1);
  const raw = lastCall[0].input.RawMessage.Data.toString('utf8');
  return raw.match(/Your verification code is: (\d{6})/)?.[1];
}

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

describe('share-link security toggles', () => {
  it('defaults requireEmailVerification to false for a newly created tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    const res = await request(app).get(`/api/trees/${treeId}/share-link`).set('Authorization', owner);
    expect(res.body.email_verification_required).toBe(false);
  });

  it('enables email verification independently of the passcode', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    const res = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view', requireEmailVerification: true });
    expect(res.status).toBe(200);
    expect(res.body.email_verification_required).toBe(true);
    expect(res.body.passcode_required).toBe(false);
  });

  it('rejects requirePasscode: true when no passcode has been set', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    const res = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view', requirePasscode: true });
    expect(res.status).toBe(400);
  });
});

describe('email verification gateway', () => {
  it('flags email_verification_required on the plain GET without leaking data', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner);

    const res = await request(app).get(`/api/public/trees/${token}`);
    expect(res.status).toBe(401);
    expect(res.body.email_verification_required).toBe(true);
    expect(res.body.passcode_required).toBe(false);
    expect(res.body.data).toBeUndefined();
  });

  it('sends a 6-digit code and grants access with the correct code', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { treeId, token } = await setupTreeWithEmailVerification(owner);
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Ada', 'last name': 'Lovelace' }, rels: {} }] });

    const reqRes = await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    expect(reqRes.status).toBe(200);
    expect(reqRes.body).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const code = extractLastOtpCode();
    expect(code).toMatch(/^\d{6}$/);

    const verifyRes = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.tree).toEqual(expect.objectContaining({ id: treeId, name: 'Family A' }));
    expect(verifyRes.body.data).toEqual([expect.objectContaining({ id: 'p1' })]);
  });

  it('rejects an incorrect code with a generic error', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner);
    await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });

    const res = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code: '000000' });
    expect(res.status).toBe(403);
  });

  it('rejects a code once it has expired', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner);
    await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    const code = extractLastOtpCode();

    await query("UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE share_token = $1", [token]);

    const res = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code });
    expect(res.status).toBe(403);
  });

  it('requesting a new code invalidates the previous one', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner);

    await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    const oldCode = extractLastOtpCode();

    await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    const newCode = extractLastOtpCode();
    expect(newCode).not.toBe(oldCode);

    const oldRes = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code: oldCode });
    expect(oldRes.status).toBe(403);

    const newRes = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code: newCode });
    expect(newRes.status).toBe(200);
  });

  it('lets an already-verified code be resubmitted to resume a session', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner);
    await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    const code = extractLastOtpCode();
    await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code });

    const resumeRes = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code });
    expect(resumeRes.status).toBe(200);
  });

  it('rate-limits OTP requests to 3 per email per 15 minutes', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner);

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
      expect(res.status).toBe(200);
    }
    const fourthRes = await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    expect(fourthRes.status).toBe(429);
  });

  it('locks a code out after 5 failed verify attempts, even with the correct code afterward', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner);
    await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    const code = extractLastOtpCode();

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code: '000000' });
      expect(res.status).toBe(403);
    }

    const finalRes = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code });
    expect(finalRes.status).toBe(403);
  });
});

describe('gate ordering: passcode before email verification', () => {
  it('rejects otp/request until the passcode has been supplied', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner, { passcode: 'letmein' });

    const res = await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    expect(res.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects otp/verify until the passcode has been supplied', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { token } = await setupTreeWithEmailVerification(owner, { passcode: 'letmein' });

    const res = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code: '123456' });
    expect(res.status).toBe(403);
  });

  it('succeeds when both gates are satisfied in order', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { treeId, token } = await setupTreeWithEmailVerification(owner, { passcode: 'letmein' });

    const gateRes = await request(app).get(`/api/public/trees/${token}`);
    expect(gateRes.status).toBe(401);
    expect(gateRes.body.passcode_required).toBe(true);
    expect(gateRes.body.email_verification_required).toBe(true);

    const passcodeRes = await request(app).post(`/api/public/trees/${token}/verify`).send({ passcode: 'letmein' });
    expect(passcodeRes.status).toBe(200);
    expect(passcodeRes.body.email_verification_required).toBe(true);
    expect(passcodeRes.body.tree).toBeUndefined();

    const otpReqRes = await request(app)
      .post(`/api/public/trees/${token}/otp/request`)
      .send({ email: 'guest@example.com', passcode: 'letmein' });
    expect(otpReqRes.status).toBe(200);
    const code = extractLastOtpCode();

    const otpVerifyRes = await request(app)
      .post(`/api/public/trees/${token}/otp/verify`)
      .send({ email: 'guest@example.com', code, passcode: 'letmein' });
    expect(otpVerifyRes.status).toBe(200);
    expect(otpVerifyRes.body.tree).toEqual(expect.objectContaining({ id: treeId }));
  });
});

describe('tree_access_log', () => {
  it('logs a successful email-verified view', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { treeId, token } = await setupTreeWithEmailVerification(owner);
    await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    const code = extractLastOtpCode();
    await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code });

    const logRes = await request(app).get(`/api/trees/${treeId}/access-log`).set('Authorization', owner);
    expect(logRes.status).toBe(200);
    expect(logRes.body.entries).toEqual([
      expect.objectContaining({ viewer_email: 'guest@example.com', view_count: 1, blocked: false }),
    ]);
  });

  it('does not log a passcode-only view', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    const enableRes = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view', passcode: 'letmein' });
    const token = enableRes.body.share_token;
    await request(app).post(`/api/public/trees/${token}/verify`).send({ passcode: 'letmein' });

    const logRes = await request(app).get(`/api/trees/${treeId}/access-log`).set('Authorization', owner);
    expect(logRes.body.entries).toEqual([]);
  });
});

describe('blocking a viewer', () => {
  it('blocks a viewer email with a generic (non-distinguishing) response', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { treeId, token } = await setupTreeWithEmailVerification(owner);
    await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    const firstCode = extractLastOtpCode();
    await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code: firstCode });

    const blockRes = await request(app)
      .post(`/api/trees/${treeId}/access-log/block`)
      .set('Authorization', owner)
      .send({ email: 'guest@example.com' });
    expect(blockRes.status).toBe(200);

    const reqRes = await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    expect(reqRes.status).toBe(200);
    expect(reqRes.body).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1); // no new email sent for the blocked request

    // Even the already-verified, resumable code from before the block no
    // longer works once blocked.
    const verifyRes = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code: firstCode });
    expect(verifyRes.status).toBe(403);
  });

  it('unblocking restores access', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const { treeId, token } = await setupTreeWithEmailVerification(owner);
    await request(app).post(`/api/trees/${treeId}/access-log/block`).set('Authorization', owner).send({ email: 'guest@example.com' });
    await request(app).post(`/api/trees/${treeId}/access-log/unblock`).set('Authorization', owner).send({ email: 'guest@example.com' });

    const reqRes = await request(app).post(`/api/public/trees/${token}/otp/request`).send({ email: 'guest@example.com' });
    expect(reqRes.status).toBe(200);
    const code = extractLastOtpCode();
    const verifyRes = await request(app).post(`/api/public/trees/${token}/otp/verify`).send({ email: 'guest@example.com', code });
    expect(verifyRes.status).toBe(200);
  });
});

describe('owner-only access log endpoints', () => {
  it('rejects a non-owner from reading or mutating the access log', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const { treeId } = await setupTreeWithEmailVerification(owner);
    await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', owner).send({ email: 'editor@example.com', role: 'editor' });

    const getRes = await request(app).get(`/api/trees/${treeId}/access-log`).set('Authorization', editor);
    expect(getRes.status).toBe(403);

    const blockRes = await request(app)
      .post(`/api/trees/${treeId}/access-log/block`)
      .set('Authorization', editor)
      .send({ email: 'guest@example.com' });
    expect(blockRes.status).toBe(403);

    const unblockRes = await request(app)
      .post(`/api/trees/${treeId}/access-log/unblock`)
      .set('Authorization', editor)
      .send({ email: 'guest@example.com' });
    expect(unblockRes.status).toBe(403);
  });
});
