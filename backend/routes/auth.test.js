import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

import { setBaseTestEnv } from '../test/testEnv.js';

setBaseTestEnv();
process.env.OTP_REQUEST_RATE_LIMIT_MAX = '1000';
process.env.OTP_VERIFY_RATE_LIMIT_MAX = '1000';

const { app } = await import('../app.js');
const { getDb } = await import('../db/index.js');
const { sentEmails, clearSentEmails } = await import('../services/email/providers/memoryProvider.js');

function lastOtp() {
  const lastEmail = sentEmails[sentEmails.length - 1];
  return lastEmail.text.match(/\d{6}/)[0];
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM otp_requests');
  db.exec('DELETE FROM users');
  clearSentEmails();
});

describe('POST /api/auth/request-otp', () => {
  it('sends an email and returns a generic success response', async () => {
    const res = await request(app).post('/api/auth/request-otp').send({ email: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('new@example.com');
    expect(sentEmails[0].text).toMatch(/\d{6}/);
  });

  it('rejects a malformed email address', async () => {
    const res = await request(app).post('/api/auth/request-otp').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(sentEmails).toHaveLength(0);
  });

  it('invalidates a previously issued pending code when a new one is requested', async () => {
    await request(app).post('/api/auth/request-otp').send({ email: 'dup@example.com' });
    const firstOtp = lastOtp();

    await request(app).post('/api/auth/request-otp').send({ email: 'dup@example.com' });

    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'dup@example.com', otp: firstOtp });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/verify-otp', () => {
  it('auto-creates the user, updates last_login_at, and sets auth cookies on success', async () => {
    await request(app).post('/api/auth/request-otp').send({ email: 'first@example.com' });
    const otp = lastOtp();

    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'first@example.com', otp });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('first@example.com');
    expect(res.body.user.last_login_at).toBeTruthy();

    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toMatch(/family_chart\.at=/);
    expect(cookies).toMatch(/family_chart\.rt=/);

    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get('first@example.com');
    expect(userCount.count).toBe(1);
  });

  it('rejects an invalid OTP format', async () => {
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'first@example.com', otp: 'abc' });
    expect(res.status).toBe(400);
  });

  it('rejects an incorrect OTP and increments the attempt count', async () => {
    await request(app).post('/api/auth/request-otp').send({ email: 'wrong@example.com' });

    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'wrong@example.com', otp: '000000' });
    expect(res.status).toBe(401);

    const db = getDb();
    const row = db.prepare('SELECT attempt_count FROM otp_requests WHERE email = ?').get('wrong@example.com');
    expect(row.attempt_count).toBe(1);
  });

  it('blocks verification once the max attempt count is reached, even with the correct code', async () => {
    await request(app).post('/api/auth/request-otp').send({ email: 'maxattempts@example.com' });
    const otp = lastOtp();

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'maxattempts@example.com', otp: '000000' });
    }

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'maxattempts@example.com', otp });
    expect(res.status).toBe(429);
  });

  it('rejects an expired OTP', async () => {
    await request(app).post('/api/auth/request-otp').send({ email: 'expired@example.com' });
    const otp = lastOtp();

    const db = getDb();
    db.prepare("UPDATE otp_requests SET expires_at = datetime('now', '-1 minute') WHERE email = ?").run(
      'expired@example.com'
    );

    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'expired@example.com', otp });
    expect(res.status).toBe(401);
  });

  it('prevents reuse of an already-consumed OTP', async () => {
    await request(app).post('/api/auth/request-otp').send({ email: 'reuse@example.com' });
    const otp = lastOtp();

    const first = await request(app).post('/api/auth/verify-otp').send({ email: 'reuse@example.com', otp });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/auth/verify-otp').send({ email: 'reuse@example.com', otp });
    expect(second.status).toBe(401);
  });
});

describe('session lifecycle', () => {
  it('allows GET /api/auth/me with a valid session and rejects requests without one', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/request-otp').send({ email: 'session@example.com' });
    const otp = lastOtp();
    await agent.post('/api/auth/verify-otp').send({ email: 'session@example.com', otp });

    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('session@example.com');

    const unauthRes = await request(app).get('/api/auth/me');
    expect(unauthRes.status).toBe(401);
  });

  it('rotates the refresh token on /api/auth/refresh', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/request-otp').send({ email: 'refresh@example.com' });
    const otp = lastOtp();
    await agent.post('/api/auth/verify-otp').send({ email: 'refresh@example.com', otp });

    const refreshRes = await agent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.headers['set-cookie'].join(';')).toMatch(/family_chart\.at=/);

    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
  });

  it('logs out and revokes the refresh token', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/request-otp').send({ email: 'logout@example.com' });
    const otp = lastOtp();
    await agent.post('/api/auth/verify-otp').send({ email: 'logout@example.com', otp });

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    const refreshRes = await agent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(401);
  });
});
