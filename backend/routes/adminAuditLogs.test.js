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

function authHeader(sub, email) {
  return `Bearer ${sub}::${email}`;
}

async function asUser(sub, email) {
  await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return authHeader(sub, email);
}

async function asAdmin() {
  return asUser('admin-sub', 'admin@example.com');
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM settings');
  db.exec('DELETE FROM audit_logs');
  db.exec('DELETE FROM users');
});

describe('admin authorization', () => {
  it('rejects non-admin users', async () => {
    const user = await asUser('user-a', 'a@example.com');
    expect((await request(app).get('/api/admin/audit-logs').set('Authorization', user)).status).toBe(403);
  });
});

describe('GET /api/admin/audit-logs', () => {
  it('lists entries created by other admin actions', async () => {
    const admin = await asAdmin();
    await request(app).put('/api/admin/settings').set('Authorization', admin).send({ maintenanceMode: true });

    const res = await request(app).get('/api/admin/audit-logs').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.logs[0].action).toBe('settings.changed');
    expect(res.body.logs[0].admin_email).toBe('admin@example.com');
  });

  it('filters by action', async () => {
    const admin = await asAdmin();
    await request(app).put('/api/admin/settings').set('Authorization', admin).send({ maintenanceMode: true });

    const res = await request(app).get('/api/admin/audit-logs?action=user.deleted').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});
