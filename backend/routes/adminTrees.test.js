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

async function asSupportAdmin() {
  const auth = await asUser('support-admin-sub', 'support-admin@example.com');
  await query("UPDATE users SET is_admin = true, admin_role = 'support_admin' WHERE email = $1", [
    'support-admin@example.com',
  ]);
  return auth;
}

beforeEach(async () => {
  await resetDb();
});

describe('admin authorization', () => {
  it('rejects non-admin users on every admin/trees endpoint', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', user).send({ name: 'My Tree' });
    const treeId = created.body.id;

    expect((await request(app).get('/api/admin/trees').set('Authorization', user)).status).toBe(403);
    expect((await request(app).get(`/api/admin/trees/${treeId}`).set('Authorization', user)).status).toBe(403);
    expect((await request(app).get(`/api/admin/trees/${treeId}/data`).set('Authorization', user)).status).toBe(403);
  });
});

describe('GET /api/admin/trees', () => {
  it('lists trees across all users with owner email and member count', async () => {
    const user = await asUser('user-a', 'a@example.com');
    await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    const admin = await asAdmin();

    const res = await request(app).get('/api/admin/trees').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.trees[0].owner_email).toBe('a@example.com');
    expect(res.body.trees[0]).toHaveProperty('member_count');
    expect(res.body.trees[0]).toHaveProperty('storage_bytes');
  });

  it('searches by tree name', async () => {
    const user = await asUser('user-a', 'a@example.com');
    await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Jones Family' });
    const admin = await asAdmin();

    const res = await request(app).get('/api/admin/trees?search=Smith').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });
});

describe('GET /api/admin/trees/:id', () => {
  it('returns tree detail with collaborators', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    const admin = await asAdmin();

    const res = await request(app).get(`/api/admin/trees/${created.body.id}`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.tree.name).toBe('Smith Family');
    expect(res.body.collaborators.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/admin/trees/:id/data', () => {
  it('returns the raw tree JSON read-only', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    const admin = await asAdmin();

    const res = await request(app).get(`/api/admin/trees/${created.body.id}/data`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('admin trees stay read-only except for status', () => {
  it('has no POST/PATCH(bare id)/DELETE handlers mounted', async () => {
    const admin = await asAdmin();
    expect((await request(app).post('/api/admin/trees').set('Authorization', admin)).status).toBe(404);
    expect((await request(app).patch('/api/admin/trees/1').set('Authorization', admin)).status).toBe(404);
    expect((await request(app).delete('/api/admin/trees/1').set('Authorization', admin)).status).toBe(404);
  });
});

describe('PATCH /api/admin/trees/:id/status', () => {
  it('disables and re-enables a tree', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    const treeId = created.body.id;
    const admin = await asAdmin();

    const disableRes = await request(app)
      .patch(`/api/admin/trees/${treeId}/status`)
      .set('Authorization', admin)
      .send({ status: 'disabled' });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.tree.status).toBe('disabled');

    const blockedRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', user);
    expect(blockedRes.status).toBe(403);

    const enableRes = await request(app)
      .patch(`/api/admin/trees/${treeId}/status`)
      .set('Authorization', admin)
      .send({ status: 'active' });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.tree.status).toBe('active');

    const allowedRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', user);
    expect(allowedRes.status).toBe(200);
  });

  it('rejects an invalid status value', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    const admin = await asAdmin();

    const res = await request(app)
      .patch(`/api/admin/trees/${created.body.id}/status`)
      .set('Authorization', admin)
      .send({ status: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown tree', async () => {
    const admin = await asAdmin();
    const res = await request(app).patch('/api/admin/trees/999999/status').set('Authorization', admin).send({ status: 'disabled' });
    expect(res.status).toBe(404);
  });

  it('rejects non-admins', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });

    const res = await request(app)
      .patch(`/api/admin/trees/${created.body.id}/status`)
      .set('Authorization', user)
      .send({ status: 'disabled' });
    expect(res.status).toBe(403);
  });
});

describe('access overrides', () => {
  it('grants, lists, and revokes an override on a tree', async () => {
    const owner = await asUser('owner-a', 'owner@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Smith Family' });
    const treeId = created.body.id;
    const grantee = await asUser('grantee-a', 'grantee@example.com');
    const admin = await asAdmin();

    const emptyList = await request(app).get(`/api/admin/trees/${treeId}/access-overrides`).set('Authorization', admin);
    expect(emptyList.status).toBe(200);
    expect(emptyList.body.overrides).toEqual([]);

    const grantRes = await request(app)
      .post(`/api/admin/trees/${treeId}/access-overrides`)
      .set('Authorization', admin)
      .send({ email: 'grantee@example.com', permissionLevel: 'read_write' });
    expect(grantRes.status).toBe(201);
    expect(grantRes.body.override.user_email).toBe('grantee@example.com');
    expect(grantRes.body.override.permission_level).toBe('read_write');

    const listRes = await request(app).get(`/api/admin/trees/${treeId}/access-overrides`).set('Authorization', admin);
    expect(listRes.status).toBe(200);
    expect(listRes.body.overrides).toHaveLength(1);
    expect(listRes.body.overrides[0].granted_by_email).toBe('admin@example.com');

    const granteeUserId = grantRes.body.override.user_id;
    const revokeRes = await request(app)
      .delete(`/api/admin/trees/${treeId}/access-overrides/${granteeUserId}`)
      .set('Authorization', admin);
    expect(revokeRes.status).toBe(200);

    const afterRevoke = await request(app).get(`/api/admin/trees/${treeId}/access-overrides`).set('Authorization', admin);
    expect(afterRevoke.body.overrides).toEqual([]);
  });

  it('404s granting an override to an email with no account', async () => {
    const owner = await asUser('owner-a', 'owner@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Smith Family' });
    const admin = await asAdmin();

    const res = await request(app)
      .post(`/api/admin/trees/${created.body.id}/access-overrides`)
      .set('Authorization', admin)
      .send({ email: 'nobody@example.com', permissionLevel: 'read_only' });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid permission level', async () => {
    const owner = await asUser('owner-a', 'owner@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Smith Family' });
    const admin = await asAdmin();

    const res = await request(app)
      .post(`/api/admin/trees/${created.body.id}/access-overrides`)
      .set('Authorization', admin)
      .send({ email: 'owner@example.com', permissionLevel: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('restricts granting and revoking to super_admin, not support_admin', async () => {
    const owner = await asUser('owner-a', 'owner@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Smith Family' });
    const treeId = created.body.id;
    const supportAdmin = await asSupportAdmin();

    const grantRes = await request(app)
      .post(`/api/admin/trees/${treeId}/access-overrides`)
      .set('Authorization', supportAdmin)
      .send({ email: 'owner@example.com', permissionLevel: 'read_only' });
    expect(grantRes.status).toBe(403);

    const revokeRes = await request(app).delete(`/api/admin/trees/${treeId}/access-overrides/1`).set('Authorization', supportAdmin);
    expect(revokeRes.status).toBe(403);

    // support_admin can still read the (empty) list.
    const listRes = await request(app).get(`/api/admin/trees/${treeId}/access-overrides`).set('Authorization', supportAdmin);
    expect(listRes.status).toBe(200);
  });

  it('granting an override does not add a tree_permissions row - the two systems stay independent', async () => {
    const owner = await asUser('owner-a', 'owner@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Smith Family' });
    const treeId = created.body.id;
    await asUser('grantee-a', 'grantee@example.com');
    const admin = await asAdmin();

    await request(app)
      .post(`/api/admin/trees/${treeId}/access-overrides`)
      .set('Authorization', admin)
      .send({ email: 'grantee@example.com', permissionLevel: 'read_write' });

    const { rows: granteeRows } = await query('SELECT id FROM users WHERE email = $1', ['grantee@example.com']);
    const { rows: permissionRows } = await query('SELECT user_id FROM tree_permissions WHERE tree_id = $1', [treeId]);
    expect(permissionRows.map((r) => r.user_id)).not.toContain(granteeRows[0].id);
  });
});
