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

beforeEach(async () => {
  await resetDb();
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

  it('surfaces the before/after diff and request metadata for a role change', async () => {
    const admin = await asAdmin();
    await asUser('user-a', 'a@example.com');
    const { query } = await import('../db/index.js');
    const { rows } = await query('SELECT id FROM users WHERE email = $1', ['a@example.com']);
    const targetId = rows[0].id;

    await request(app)
      .patch(`/api/admin/users/${targetId}/role`)
      .set('Authorization', admin)
      .set('User-Agent', 'vitest-agent')
      .send({ adminRole: 'support_admin' });

    const res = await request(app).get('/api/admin/audit-logs?action=ROLE_UPDATE').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const [log] = res.body.logs;
    expect(log.old_values).toEqual({ adminRole: null });
    expect(log.new_values).toEqual({ adminRole: 'support_admin' });
    expect(log.user_agent).toBe('vitest-agent');
  });
});
