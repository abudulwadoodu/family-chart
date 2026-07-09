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
  // Touch /api/auth/me once so the local user row exists before any tree calls.
  await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return authHeader(sub, email);
}

beforeEach(async () => {
  await resetDb();
});

describe('tree sharing and permissions', () => {
  it('lets the owner share a tree with an existing user as editor or viewer', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const shareRes = await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'editor@example.com', role: 'editor' });
    expect(shareRes.status).toBe(201);

    const permissionsRes = await request(app).get(`/api/trees/${treeId}/permissions`).set('Authorization', owner);
    expect(permissionsRes.status).toBe(200);
    expect(permissionsRes.body.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'owner@example.com', role: 'owner' }),
        expect.objectContaining({ email: 'editor@example.com', role: 'editor' }),
      ])
    );

    const editorTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', editor);
    expect(editorTreeRes.status).toBe(200);
    expect(editorTreeRes.body.role).toBe('editor');
  });

  it('rejects sharing with an email that has never signed in', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'ghost@example.com', role: 'viewer' });
    expect(res.status).toBe(404);
  });

  it('prevents duplicate permissions for the same user', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    await asUser('viewer-sub', 'viewer@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const dupeRes = await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'editor' });
    expect(dupeRes.status).toBe(409);
  });

  it('rejects sharing a tree with its own owner', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'owner@example.com', role: 'editor' });
    expect(res.status).toBe(400);
  });

  it('blocks non-owners from managing permissions', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'editor@example.com', role: 'editor' });

    const listRes = await request(app).get(`/api/trees/${treeId}/permissions`).set('Authorization', editor);
    expect(listRes.status).toBe(403);

    const shareRes = await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', editor)
      .send({ email: 'owner@example.com', role: 'viewer' });
    expect(shareRes.status).toBe(403);
  });

  it('lets the owner change a collaborator role and revoke access, but never their own', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const ownerMe = await request(app).get('/api/auth/me').set('Authorization', owner);
    const collaborator = await asUser('viewer-sub', 'viewer@example.com');
    const collaboratorMe = await request(app).get('/api/auth/me').set('Authorization', collaborator);

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const updateRes = await request(app)
      .put(`/api/trees/${treeId}/share/${collaboratorMe.body.user.id}`)
      .set('Authorization', owner)
      .send({ role: 'editor' });
    expect(updateRes.status).toBe(200);

    const selfUpdateRes = await request(app)
      .put(`/api/trees/${treeId}/share/${ownerMe.body.user.id}`)
      .set('Authorization', owner)
      .send({ role: 'editor' });
    expect(selfUpdateRes.status).toBe(400);

    const selfDeleteRes = await request(app)
      .delete(`/api/trees/${treeId}/share/${ownerMe.body.user.id}`)
      .set('Authorization', owner);
    expect(selfDeleteRes.status).toBe(400);

    const deleteRes = await request(app)
      .delete(`/api/trees/${treeId}/share/${collaboratorMe.body.user.id}`)
      .set('Authorization', owner);
    expect(deleteRes.status).toBe(200);

    const revokedAccessRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', collaborator);
    expect(revokedAccessRes.status).toBe(403);
  });

  it('enforces viewer/editor data permissions on the tree itself', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const saveRes = await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', viewer)
      .send({ json_data: [] });
    expect(saveRes.status).toBe(403);

    const deleteRes = await request(app).delete(`/api/trees/${treeId}`).set('Authorization', viewer);
    expect(deleteRes.status).toBe(403);
  });
});
