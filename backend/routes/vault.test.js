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
  const res = await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return { header: authHeader(sub, email), id: res.body.user.id };
}

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/vault/trees/:id/snapshots', () => {
  it('lets an owner snapshot their own tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/vault/trees/${treeId}/snapshots`)
      .set('Authorization', owner.header)
      .send({ archiveName: 'My Backup' });

    expect(res.status).toBe(201);
    expect(res.body.snapshot).toMatchObject({ treeId, archiveName: 'My Backup' });
  });

  it('blocks an editor from snapshotting a tree they do not own', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner.header)
      .send({ email: 'editor@example.com', role: 'editor' });

    const res = await request(app)
      .post(`/api/vault/trees/${treeId}/snapshots`)
      .set('Authorization', editor.header)
      .send({ archiveName: 'Stolen Backup' });

    expect(res.status).toBe(403);
  });

  it('blocks a viewer from snapshotting a tree they do not own', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner.header)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const res = await request(app)
      .post(`/api/vault/trees/${treeId}/snapshots`)
      .set('Authorization', viewer.header)
      .send({ archiveName: 'Stolen Backup' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/vault/snapshots', () => {
  it('only lists snapshots belonging to the requesting user', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const other = await asUser('other-sub', 'other@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app).post(`/api/vault/trees/${treeId}/snapshots`).set('Authorization', owner.header).send({});

    const ownerList = await request(app).get('/api/vault/snapshots').set('Authorization', owner.header);
    expect(ownerList.body.snapshots).toHaveLength(1);

    const otherList = await request(app).get('/api/vault/snapshots').set('Authorization', other.header);
    expect(otherList.body.snapshots).toHaveLength(0);
  });
});

describe('GET /api/vault/snapshots/:id/export/gedcom', () => {
  it('streams a GEDCOM file for the owner and rejects other users', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const other = await asUser('other-sub', 'other@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const snapshotRes = await request(app)
      .post(`/api/vault/trees/${treeId}/snapshots`)
      .set('Authorization', owner.header)
      .send({ archiveName: 'Family A Backup' });
    const snapshotId = snapshotRes.body.snapshot.id;

    const res = await request(app)
      .get(`/api/vault/snapshots/${snapshotId}/export/gedcom`)
      .set('Authorization', owner.header);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('0 HEAD');
    expect(res.text).toContain('0 TRLR');

    const forbiddenRes = await request(app)
      .get(`/api/vault/snapshots/${snapshotId}/export/gedcom`)
      .set('Authorization', other.header);
    expect(forbiddenRes.status).toBe(404);
  });
});

describe('POST /api/vault/snapshots/:id/restore', () => {
  it('restores a snapshot as a brand-new tree owned by the same user', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const snapshotRes = await request(app)
      .post(`/api/vault/trees/${treeId}/snapshots`)
      .set('Authorization', owner.header)
      .send({ archiveName: 'Family A Backup' });
    const snapshotId = snapshotRes.body.snapshot.id;

    const res = await request(app)
      .post(`/api/vault/snapshots/${snapshotId}/restore`)
      .set('Authorization', owner.header)
      .send({ mode: 'new', treeName: 'Restored Family A' });

    expect(res.status).toBe(201);
    expect(res.body.tree).toMatchObject({ name: 'Restored Family A' });
    expect(res.body.tree.id).not.toBe(treeId);

    const treesList = await request(app).get('/api/trees').set('Authorization', owner.header);
    expect(treesList.body.trees).toHaveLength(2);
  });

  it('replaces an existing tree the user owns with the snapshot data', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const sourceRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Source' });
    const sourceTreeId = sourceRes.body.id;
    const snapshotRes = await request(app)
      .post(`/api/vault/trees/${sourceTreeId}/snapshots`)
      .set('Authorization', owner.header)
      .send({});
    const snapshotId = snapshotRes.body.snapshot.id;

    const targetRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Target' });
    const targetTreeId = targetRes.body.id;

    const res = await request(app)
      .post(`/api/vault/snapshots/${snapshotId}/restore`)
      .set('Authorization', owner.header)
      .send({ mode: 'replace', treeId: targetTreeId });

    expect(res.status).toBe(200);
    expect(res.body.tree).toMatchObject({ id: targetTreeId, name: 'Target' });

    const targetTree = await request(app).get(`/api/trees/${targetTreeId}`).set('Authorization', owner.header);
    const sourceTree = await request(app).get(`/api/trees/${sourceTreeId}`).set('Authorization', owner.header);
    expect(targetTree.body.data).toEqual(sourceTree.body.data);
  });

  it('blocks replacing a tree the user does not own', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const other = await asUser('other-sub', 'other@example.com');
    const sourceRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Source' });
    const sourceTreeId = sourceRes.body.id;
    const snapshotRes = await request(app)
      .post(`/api/vault/trees/${sourceTreeId}/snapshots`)
      .set('Authorization', owner.header)
      .send({});
    const snapshotId = snapshotRes.body.snapshot.id;

    const otherTreeRes = await request(app).post('/api/trees').set('Authorization', other.header).send({ name: 'Other' });
    const otherTreeId = otherTreeRes.body.id;

    const res = await request(app)
      .post(`/api/vault/snapshots/${snapshotId}/restore`)
      .set('Authorization', owner.header)
      .send({ mode: 'replace', treeId: otherTreeId });

    expect(res.status).toBe(403);
  });

  it('blocks restoring a snapshot that belongs to another user', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const other = await asUser('other-sub', 'other@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const snapshotRes = await request(app)
      .post(`/api/vault/trees/${treeId}/snapshots`)
      .set('Authorization', owner.header)
      .send({});
    const snapshotId = snapshotRes.body.snapshot.id;

    const res = await request(app)
      .post(`/api/vault/snapshots/${snapshotId}/restore`)
      .set('Authorization', other.header)
      .send({ mode: 'new' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/vault/snapshots/:id', () => {
  it('deletes only the requesting user\'s own snapshot', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const other = await asUser('other-sub', 'other@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const snapshotRes = await request(app)
      .post(`/api/vault/trees/${treeId}/snapshots`)
      .set('Authorization', owner.header)
      .send({});
    const snapshotId = snapshotRes.body.snapshot.id;

    const forbiddenDelete = await request(app)
      .delete(`/api/vault/snapshots/${snapshotId}`)
      .set('Authorization', other.header);
    expect(forbiddenDelete.status).toBe(404);

    const res = await request(app).delete(`/api/vault/snapshots/${snapshotId}`).set('Authorization', owner.header);
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/vault/snapshots').set('Authorization', owner.header);
    expect(list.body.snapshots).toHaveLength(0);
  });
});
