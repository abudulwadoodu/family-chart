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

describe('tree settings (default focus person)', () => {
  it('lets the owner set the default focus person to an existing member and returns it from GET', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Jane', gender: 'F' }, rels: {} }] });

    const settingsRes = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_main_id: 'p1' });
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.default_main_id).toBe('p1');

    const getRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    expect(getRes.body.tree.default_main_id).toBe('p1');
  });

  it('rejects a default_main_id that is not a member of the tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_main_id: 'not-a-real-person' });
    expect(res.status).toBe(400);
  });

  it('lets the owner clear the default focus person by sending null', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Jane', gender: 'F' }, rels: {} }] });
    await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_main_id: 'p1' });

    const clearRes = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_main_id: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.default_main_id).toBeNull();
  });

  it('blocks non-owners from changing tree settings', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'editor@example.com', role: 'editor' });

    const res = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', editor)
      .send({ default_main_id: null });
    expect(res.status).toBe(403);
  });

  it('lets the owner set default_generation_depth independently of default_main_id, and null means unlimited', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    // A tree nobody has configured yet reads back as null (unlimited), not
    // some hardcoded default - see backend/routes/trees.js.
    const initialGetRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    expect(initialGetRes.body.tree.default_generation_depth).toBeNull();

    const depthRes = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_generation_depth: 6 });
    expect(depthRes.status).toBe(200);
    expect(depthRes.body.default_generation_depth).toBe(6);

    const getRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    expect(getRes.body.tree.default_generation_depth).toBe(6);

    const clearRes = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_generation_depth: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.default_generation_depth).toBeNull();
  });

  it('rejects an out-of-range or non-integer default_generation_depth', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const tooLow = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_generation_depth: 0 });
    expect(tooLow.status).toBe(400);

    const tooHigh = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_generation_depth: 21 });
    expect(tooHigh.status).toBe(400);

    const notInteger = await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_generation_depth: 3.5 });
    expect(notInteger.status).toBe(400);
  });

  it('updating one setting leaves the other untouched', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Jane', gender: 'F' }, rels: {} }] });

    await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_main_id: 'p1' });
    await request(app)
      .patch(`/api/trees/${treeId}/settings`)
      .set('Authorization', owner)
      .send({ default_generation_depth: 5 });

    const getRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    expect(getRes.body.tree.default_main_id).toBe('p1');
    expect(getRes.body.tree.default_generation_depth).toBe(5);
  });

  it('requires at least one setting in the request body', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app).patch(`/api/trees/${treeId}/settings`).set('Authorization', owner).send({});
    expect(res.status).toBe(400);
  });
});
