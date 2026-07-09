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

const { app } = await import('../app.js');
const { query } = await import('../db/index.js');

function tokenFor(sub, email) {
  return `${sub}::${email}`;
}

beforeEach(async () => {
  await resetDb();
});

describe('GET /api/auth/me', () => {
  it('rejects requests without a bearer token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('auto-creates a local user on first sight and returns it', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor('sub-1', 'first@example.com')}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('first@example.com');
    expect(res.body.user.last_login_at).toBeTruthy();

    const { rows } = await query('SELECT COUNT(*) AS count FROM users WHERE cognito_sub = $1', ['sub-1']);
    expect(Number(rows[0].count)).toBe(1);
  });

  it('reuses the existing local user on subsequent requests with the same sub', async () => {
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor('sub-2', 'second@example.com')}`);
    const second = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor('sub-2', 'second@example.com')}`);

    expect(second.status).toBe(200);
    const { rows } = await query('SELECT COUNT(*) AS count FROM users WHERE cognito_sub = $1', ['sub-2']);
    expect(Number(rows[0].count)).toBe(1);
  });
});
