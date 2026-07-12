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
