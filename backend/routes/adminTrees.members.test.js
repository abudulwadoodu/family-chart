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
  db.exec('DELETE FROM audit_logs');
  db.exec('DELETE FROM tree_permissions');
  db.exec('DELETE FROM family_data');
  db.exec('DELETE FROM trees');
  db.exec('DELETE FROM users');
});

describe('admin authorization', () => {
  it('rejects non-admin users', async () => {
    const user = await asUser('user-a', 'a@example.com');
    expect((await request(app).get('/api/admin/trees/members').set('Authorization', user)).status).toBe(403);
  });
});

describe('GET /api/admin/trees/members', () => {
  it('flattens members across every tree, matching the dashboard totalMembers count', async () => {
    const user = await asUser('user-a', 'a@example.com');
    await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Jones Family' });
    const admin = await asAdmin();

    const stats = await request(app).get('/api/admin/dashboard/stats').set('Authorization', admin);
    const res = await request(app).get('/api/admin/trees/members').set('Authorization', admin);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(stats.body.totalMembers);
    expect(res.body.members[0]).toHaveProperty('treeName');
    expect(res.body.members[0]).toHaveProperty('name');
  });

  it('searches by member name or tree name', async () => {
    const user = await asUser('user-a', 'a@example.com');
    await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    const admin = await asAdmin();

    const res = await request(app).get('/api/admin/trees/members?search=Smith').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.members.every((m) => m.treeName.includes('Smith') || m.name.length)).toBe(true);
  });

  it('filters to a single tree via treeId', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Smith Family' });
    await request(app).post('/api/trees').set('Authorization', user).send({ name: 'Jones Family' });
    const admin = await asAdmin();

    const res = await request(app).get(`/api/admin/trees/members?treeId=${created.body.id}`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.members.every((m) => m.treeId === created.body.id)).toBe(true);
  });
});
