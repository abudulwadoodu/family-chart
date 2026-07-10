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

async function userId(auth) {
  const res = await request(app).get('/api/auth/me').set('Authorization', auth);
  return res.body.user.id;
}

beforeEach(async () => {
  await resetDb();
});

async function createTree(owner) {
  const res = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
  return res.body.id;
}

async function share(owner, treeId, email, role) {
  await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', owner).send({ email, role });
}

async function uploadMedia(auth, treeId, { visibility, shareUserIds } = {}) {
  let req = request(app)
    .post(`/api/trees/${treeId}/media`)
    .set('Authorization', auth)
    .field('kind', 'photo')
    .field('title', 'A photo');
  if (visibility) req = req.field('visibility', visibility);
  if (shareUserIds) req = req.field('shareUserIds', JSON.stringify(shareUserIds));
  return req.attach('file', Buffer.from('x'), 'a.jpg');
}

describe('media/event visibility', () => {
  it('defaults to tree-wide visibility, visible to owner, editor-B, and viewer (regression guard)', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'viewer@example.com', 'viewer');

    const uploadRes = await uploadMedia(editorA, treeId);
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.media.visibility).toBe('tree');

    for (const auth of [owner, editorA, viewer]) {
      const listRes = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', auth);
      expect(listRes.body.media).toHaveLength(1);
      expect(listRes.body.media[0].access).toBe('full');
    }
  });

  it('"only me": visible only to uploader, hidden entirely from owner (not even a stub)', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const editorB = await asUser('editorB-sub', 'editorb@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'editorb@example.com', 'editor');

    const uploadRes = await uploadMedia(editorA, treeId, { visibility: 'private' });
    expect(uploadRes.status).toBe(201);
    const mediaId = uploadRes.body.media.id;

    const editorAList = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', editorA);
    expect(editorAList.body.media).toHaveLength(1);

    const ownerList = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', owner);
    expect(ownerList.body.media).toHaveLength(0);

    const editorBList = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', editorB);
    expect(editorBList.body.media).toHaveLength(0);

    for (const auth of [owner, editorB]) {
      const fileRes = await request(app).get(`/api/trees/${treeId}/media/${mediaId}/file`).set('Authorization', auth);
      expect(fileRes.status).toBe(404);
    }
  });

  it('"shared with specific people": sharee gets full access, non-shared user gets nothing', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const editorB = await asUser('editorB-sub', 'editorb@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'editorb@example.com', 'editor');
    await share(owner, treeId, 'viewer@example.com', 'viewer');
    const editorBId = await userId(editorB);

    const uploadRes = await uploadMedia(editorA, treeId, { visibility: 'private', shareUserIds: [editorBId] });
    expect(uploadRes.status).toBe(201);
    const mediaId = uploadRes.body.media.id;

    const editorBList = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', editorB);
    expect(editorBList.body.media).toHaveLength(1);
    expect(editorBList.body.media[0].access).toBe('full');

    const editorBFile = await request(app).get(`/api/trees/${treeId}/media/${mediaId}/file`).set('Authorization', editorB);
    expect(editorBFile.status).toBe(200);

    const viewerList = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', viewer);
    expect(viewerList.body.media).toHaveLength(0);
  });

  it('owner gets a metadata-only stub for a "shared with specific people" item, cannot view the file, but can delete it', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const editorB = await asUser('editorB-sub', 'editorb@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'editorb@example.com', 'editor');
    const editorBId = await userId(editorB);

    const uploadRes = await uploadMedia(editorA, treeId, { visibility: 'private', shareUserIds: [editorBId] });
    const mediaId = uploadRes.body.media.id;

    const ownerList = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', owner);
    expect(ownerList.body.media).toHaveLength(1);
    const stub = ownerList.body.media[0];
    expect(stub.access).toBe('stub');
    expect(stub.storage_key).toBeUndefined();
    expect(stub.uploaded_by).toBeDefined();

    const ownerFileRes = await request(app).get(`/api/trees/${treeId}/media/${mediaId}/file`).set('Authorization', owner);
    expect(ownerFileRes.status).toBe(404);

    const ownerUsageRes = await request(app).get(`/api/trees/${treeId}/media/${mediaId}/usage`).set('Authorization', owner);
    expect(ownerUsageRes.status).toBe(200);

    const ownerDeleteRes = await request(app).delete(`/api/trees/${treeId}/media/${mediaId}`).set('Authorization', owner);
    expect(ownerDeleteRes.status).toBe(200);

    const afterDelete = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', editorA);
    expect(afterDelete.body.media).toHaveLength(0);
  });

  it('per-person tab (memberId filter) respects visibility', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'viewer@example.com', 'viewer');

    const uploadRes = await uploadMedia(editorA, treeId, { visibility: 'private' });
    const mediaId = uploadRes.body.media.id;
    await request(app)
      .post(`/api/trees/${treeId}/media/${mediaId}/tags`)
      .set('Authorization', editorA)
      .send({ memberId: 'person-1' });

    const viewerList = await request(app)
      .get(`/api/trees/${treeId}/media`)
      .query({ memberId: 'person-1' })
      .set('Authorization', viewer);
    expect(viewerList.body.media).toHaveLength(0);

    const uploaderList = await request(app)
      .get(`/api/trees/${treeId}/media`)
      .query({ memberId: 'person-1' })
      .set('Authorization', editorA);
    expect(uploaderList.body.media).toHaveLength(1);
  });

  it('private media in a tree-visible album does not leak to a non-shared viewer', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'viewer@example.com', 'viewer');

    const uploadRes = await uploadMedia(editorA, treeId, { visibility: 'private' });
    const mediaId = uploadRes.body.media.id;

    const albumRes = await request(app)
      .post(`/api/trees/${treeId}/albums`)
      .set('Authorization', owner)
      .send({ name: 'Shared Album' });
    const albumId = albumRes.body.album.id;
    await request(app)
      .post(`/api/trees/${treeId}/albums/${albumId}/media`)
      .set('Authorization', owner)
      .send({ mediaId });

    const viewerAlbumRes = await request(app).get(`/api/trees/${treeId}/albums/${albumId}`).set('Authorization', viewer);
    expect(viewerAlbumRes.status).toBe(200);
    expect(viewerAlbumRes.body.media).toHaveLength(0);

    const uploaderAlbumRes = await request(app).get(`/api/trees/${treeId}/albums/${albumId}`).set('Authorization', editorA);
    expect(uploaderAlbumRes.body.media).toHaveLength(1);
  });

  it('private media attached to a tree-visible event does not leak to a non-shared viewer, but the event itself stays visible', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'viewer@example.com', 'viewer');

    const uploadRes = await uploadMedia(editorA, treeId, { visibility: 'private' });
    const mediaId = uploadRes.body.media.id;

    const eventRes = await request(app)
      .post(`/api/trees/${treeId}/events`)
      .set('Authorization', owner)
      .send({ title: 'Reunion' });
    const eventId = eventRes.body.event.id;
    await request(app)
      .post(`/api/trees/${treeId}/events/${eventId}/media`)
      .set('Authorization', owner)
      .send({ mediaId });

    const viewerEventRes = await request(app).get(`/api/trees/${treeId}/events/${eventId}`).set('Authorization', viewer);
    expect(viewerEventRes.status).toBe(200);
    expect(viewerEventRes.body.event.id).toBe(eventId);
    expect(viewerEventRes.body.media).toHaveLength(0);
  });

  it('rejects shareUserIds containing a user without tree access', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    await asUser('stranger-sub', 'stranger@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    const strangerId = await userId(await asUser('stranger-sub', 'stranger@example.com'));

    const uploadRes = await uploadMedia(editorA, treeId, { visibility: 'private', shareUserIds: [strangerId] });
    expect(uploadRes.status).toBe(400);
  });

  it('only the uploader or tree owner can change visibility on an existing item - a different editor cannot, even though they can edit the title', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const editorB = await asUser('editorB-sub', 'editorb@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'editorb@example.com', 'editor');

    const uploadRes = await uploadMedia(editorA, treeId);
    const mediaId = uploadRes.body.media.id;

    const editorBTitlePatch = await request(app)
      .patch(`/api/trees/${treeId}/media/${mediaId}`)
      .set('Authorization', editorB)
      .send({ title: 'Retitled by editor B' });
    expect(editorBTitlePatch.status).toBe(200);
    expect(editorBTitlePatch.body.media.title).toBe('Retitled by editor B');

    const editorBVisibilityPatch = await request(app)
      .patch(`/api/trees/${treeId}/media/${mediaId}`)
      .set('Authorization', editorB)
      .send({ title: 'Retitled by editor B', visibility: 'private' });
    expect(editorBVisibilityPatch.status).toBe(403);

    const ownerVisibilityPatch = await request(app)
      .patch(`/api/trees/${treeId}/media/${mediaId}`)
      .set('Authorization', owner)
      .send({ title: 'Retitled by editor B', visibility: 'private' });
    expect(ownerVisibilityPatch.status).toBe(200);
    expect(ownerVisibilityPatch.body.media.visibility).toBe('private');

    const uploaderVisibilityPatch = await request(app)
      .patch(`/api/trees/${treeId}/media/${mediaId}`)
      .set('Authorization', editorA)
      .send({ title: 'Retitled by editor B', visibility: 'tree' });
    expect(uploaderVisibilityPatch.status).toBe(200);
    expect(uploaderVisibilityPatch.body.media.visibility).toBe('tree');
  });

  it('GET /api/trees/:id/permissions is available to editors now, still 403 for viewers', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'viewer@example.com', 'viewer');

    const editorRes = await request(app).get(`/api/trees/${treeId}/permissions`).set('Authorization', editorA);
    expect(editorRes.status).toBe(200);
    expect(editorRes.body.permissions.length).toBeGreaterThan(0);

    const viewerRes = await request(app).get(`/api/trees/${treeId}/permissions`).set('Authorization', viewer);
    expect(viewerRes.status).toBe(403);
  });

  it('removing a collaborator purges their media_shares/event_shares grants', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const editorB = await asUser('editorB-sub', 'editorb@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'editorb@example.com', 'editor');
    const editorBId = await userId(editorB);

    await uploadMedia(editorA, treeId, { visibility: 'private', shareUserIds: [editorBId] });

    const permsRes = await request(app).get(`/api/trees/${treeId}/permissions`).set('Authorization', owner);
    const editorBPermission = permsRes.body.permissions.find((p) => p.user_id === editorBId);
    expect(editorBPermission).toBeDefined();

    const removeRes = await request(app)
      .delete(`/api/trees/${treeId}/share/${editorBId}`)
      .set('Authorization', owner);
    expect(removeRes.status).toBe(200);

    // editorB no longer has any tree access at all, so they can't even list
    // media to check - re-share them without the item's grant and confirm
    // they no longer see it, proving the share row was actually purged
    // (not just unreachable).
    await share(owner, treeId, 'editorb@example.com', 'editor');
    const editorBListAfterRejoin = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', editorB);
    expect(editorBListAfterRejoin.body.media).toHaveLength(0);
  });
});

describe('event visibility', () => {
  async function createEvent(auth, treeId, { visibility, shareUserIds } = {}) {
    return request(app)
      .post(`/api/trees/${treeId}/events`)
      .set('Authorization', auth)
      .send({ title: 'A private event', visibility, shareUserIds });
  }

  it('defaults to tree-wide visibility (regression guard)', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'viewer@example.com', 'viewer');

    const eventRes = await createEvent(editorA, treeId);
    expect(eventRes.status).toBe(201);
    expect(eventRes.body.event.visibility).toBe('tree');

    for (const auth of [owner, editorA, viewer]) {
      const listRes = await request(app).get(`/api/trees/${treeId}/events`).set('Authorization', auth);
      expect(listRes.body.events).toHaveLength(1);
    }
  });

  it('"only me" event is hidden from the owner entirely', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');

    const eventRes = await createEvent(editorA, treeId, { visibility: 'private' });
    const eventId = eventRes.body.event.id;

    const ownerList = await request(app).get(`/api/trees/${treeId}/events`).set('Authorization', owner);
    expect(ownerList.body.events).toHaveLength(0);

    const ownerGet = await request(app).get(`/api/trees/${treeId}/events/${eventId}`).set('Authorization', owner);
    expect(ownerGet.status).toBe(404);
  });

  it('owner gets a stub (event visible, no participants/media detail) for a shared-with-specific-people event', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const editorB = await asUser('editorB-sub', 'editorb@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'editorb@example.com', 'editor');
    const editorBId = await userId(editorB);

    const eventRes = await createEvent(editorA, treeId, { visibility: 'private', shareUserIds: [editorBId] });
    const eventId = eventRes.body.event.id;

    const ownerGet = await request(app).get(`/api/trees/${treeId}/events/${eventId}`).set('Authorization', owner);
    expect(ownerGet.status).toBe(200);
    expect(ownerGet.body.participants).toEqual([]);
    expect(ownerGet.body.media).toEqual([]);

    const editorBGet = await request(app).get(`/api/trees/${treeId}/events/${eventId}`).set('Authorization', editorB);
    expect(editorBGet.status).toBe(200);
    expect(editorBGet.body.event.id).toBe(eventId);
  });
});
