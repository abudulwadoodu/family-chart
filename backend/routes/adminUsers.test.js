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

// admin@example.com is whitelisted via ADMIN_EMAILS in setBaseTestEnv() and syncs to super_admin.
async function asAdmin() {
  return asUser('admin-sub', 'admin@example.com');
}

function userIdFor(email) {
  return getDb().prepare('SELECT id FROM users WHERE email = ?').get(email).id;
}

async function asSupportAdmin() {
  const auth = await asUser('support-admin-sub', 'support-admin@example.com');
  getDb().prepare("UPDATE users SET is_admin = 1, admin_role = 'support_admin' WHERE email = ?").run('support-admin@example.com');
  return auth;
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM audit_logs');
  db.exec('DELETE FROM tree_permissions');
  db.exec('DELETE FROM family_data');
  db.exec('DELETE FROM trees');
  db.exec('DELETE FROM users');
});

describe('admin authorization', () => {
  it('rejects non-admin users on every admin/users endpoint', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const targetId = userIdFor('a@example.com');

    expect((await request(app).get('/api/admin/users').set('Authorization', user)).status).toBe(403);
    expect((await request(app).get(`/api/admin/users/${targetId}`).set('Authorization', user)).status).toBe(403);
    expect(
      (await request(app).patch(`/api/admin/users/${targetId}/status`).set('Authorization', user).send({ status: 'suspended' }))
        .status
    ).toBe(403);
    expect((await request(app).delete(`/api/admin/users/${targetId}`).set('Authorization', user)).status).toBe(403);
  });

  it('rejects support_admin on super_admin-only routes', async () => {
    const supportAdmin = await asSupportAdmin();
    const user = await asUser('user-a', 'a@example.com');
    const targetId = userIdFor('a@example.com');

    const res = await request(app)
      .patch(`/api/admin/users/${targetId}/role`)
      .set('Authorization', supportAdmin)
      .send({ adminRole: 'support_admin' });
    expect(res.status).toBe(403);

    const del = await request(app).delete(`/api/admin/users/${targetId}`).set('Authorization', supportAdmin);
    expect(del.status).toBe(403);
  });

  it('allows support_admin to suspend/activate but not delete', async () => {
    const supportAdmin = await asSupportAdmin();
    await asUser('user-a', 'a@example.com');
    const targetId = userIdFor('a@example.com');

    const res = await request(app)
      .patch(`/api/admin/users/${targetId}/status`)
      .set('Authorization', supportAdmin)
      .send({ status: 'suspended' });
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('suspended');
  });
});

describe('GET /api/admin/users', () => {
  it('lists users with search and pagination', async () => {
    await asUser('user-a', 'a@example.com');
    await asUser('user-b', 'b@example.com');
    const admin = await asAdmin();

    const res = await request(app).get('/api/admin/users?search=a@example').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.users[0].email).toBe('a@example.com');
  });

  it('filters by activity window so the drilldown matches the dashboard count', async () => {
    await asUser('user-a', 'a@example.com');
    const admin = await asAdmin();

    const stats = await request(app).get('/api/admin/dashboard/stats').set('Authorization', admin);
    const filtered = await request(app).get('/api/admin/users?activity=activeToday').set('Authorization', admin);

    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBe(stats.body.activeToday);

    const newRegs = await request(app).get('/api/admin/users?activity=newRegistrations').set('Authorization', admin);
    expect(newRegs.body.total).toBe(stats.body.newRegistrations);
  });
});

describe('GET /api/admin/users/:id', () => {
  it('returns profile with owned trees and storage usage', async () => {
    const user = await asUser('user-a', 'a@example.com');
    await request(app).post('/api/trees').set('Authorization', user).send({ name: 'My Tree' });
    const admin = await asAdmin();
    const targetId = userIdFor('a@example.com');

    const res = await request(app).get(`/api/admin/users/${targetId}`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.user.owned_trees).toHaveLength(1);
    expect(typeof res.body.user.storage_bytes).toBe('number');
  });
});

describe('PATCH /api/admin/users/:id/status', () => {
  it('suspends and reactivates a user', async () => {
    await asUser('user-a', 'a@example.com');
    const admin = await asAdmin();
    const targetId = userIdFor('a@example.com');

    const suspend = await request(app)
      .patch(`/api/admin/users/${targetId}/status`)
      .set('Authorization', admin)
      .send({ status: 'suspended' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.user.status).toBe('suspended');

    const activate = await request(app)
      .patch(`/api/admin/users/${targetId}/status`)
      .set('Authorization', admin)
      .send({ status: 'active' });
    expect(activate.status).toBe(200);
    expect(activate.body.user.status).toBe('active');
  });

  it('blocks a suspended user from authenticating again', async () => {
    await asUser('user-a', 'a@example.com');
    const admin = await asAdmin();
    const targetId = userIdFor('a@example.com');

    await request(app).patch(`/api/admin/users/${targetId}/status`).set('Authorization', admin).send({ status: 'suspended' });

    const res = await request(app).get('/api/auth/me').set('Authorization', authHeader('user-a', 'a@example.com'));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('deletes a user and refuses to delete yourself', async () => {
    await asUser('user-a', 'a@example.com');
    const admin = await asAdmin();
    const targetId = userIdFor('a@example.com');
    const adminId = userIdFor('admin@example.com');

    const res = await request(app).delete(`/api/admin/users/${targetId}`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT id FROM users WHERE id = ?').get(targetId)).toBeUndefined();

    const selfDelete = await request(app).delete(`/api/admin/users/${adminId}`).set('Authorization', admin);
    expect(selfDelete.status).toBe(400);
  });
});
