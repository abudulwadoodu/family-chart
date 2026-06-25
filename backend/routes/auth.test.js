import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

import { setBaseTestEnv } from '../test/testEnv.js';

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
const { getDb } = await import('../db/index.js');

function tokenFor(sub, email) {
  return `${sub}::${email}`;
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM users');
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

    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE cognito_sub = ?').get('sub-1');
    expect(userCount.count).toBe(1);
  });

  it('reuses the existing local user on subsequent requests with the same sub', async () => {
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor('sub-2', 'second@example.com')}`);
    const second = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor('sub-2', 'second@example.com')}`);

    expect(second.status).toBe(200);
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE cognito_sub = ?').get('sub-2');
    expect(userCount.count).toBe(1);
  });
});
