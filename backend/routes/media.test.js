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

beforeEach(async () => {
  await resetDb();
});

async function createTree(owner) {
  const res = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
  return res.body.id;
}

describe('media, albums, and events routes', () => {
  it('uploads media, tags a member, and lists it back', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);

    const uploadRes = await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', owner)
      .field('kind', 'photo')
      .field('title', 'Reunion 2020')
      .attach('file', Buffer.from('fake-image-bytes'), 'reunion.jpg');
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.media.kind).toBe('photo');
    expect(uploadRes.body.media.url).toBe(`/api/trees/${treeId}/media/${uploadRes.body.media.id}/file`);

    const mediaId = uploadRes.body.media.id;

    const fileRes = await request(app).get(uploadRes.body.media.url).set('Authorization', owner);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toMatch(/image\/jpeg/);
    expect(fileRes.body.toString()).toBe('fake-image-bytes');

    const tagRes = await request(app)
      .post(`/api/trees/${treeId}/media/${mediaId}/tags`)
      .set('Authorization', owner)
      .send({ memberId: 'person-1' });
    expect(tagRes.status).toBe(201);
    expect(tagRes.body.tag.source).toBe('manual');

    const listRes = await request(app)
      .get(`/api/trees/${treeId}/media`)
      .query({ memberId: 'person-1' })
      .set('Authorization', owner);
    expect(listRes.status).toBe(200);
    expect(listRes.body.media).toHaveLength(1);
    expect(listRes.body.media[0].id).toBe(mediaId);
  });

  it('updates media title/description and denies a viewer from editing or deleting', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);

    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const uploadRes = await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', owner)
      .field('kind', 'photo')
      .field('title', 'Original title')
      .attach('file', Buffer.from('x'), 'a.jpg');
    const mediaId = uploadRes.body.media.id;

    const viewerPatchRes = await request(app)
      .patch(`/api/trees/${treeId}/media/${mediaId}`)
      .set('Authorization', viewer)
      .send({ title: 'Hacked title' });
    expect(viewerPatchRes.status).toBe(403);

    const patchRes = await request(app)
      .patch(`/api/trees/${treeId}/media/${mediaId}`)
      .set('Authorization', owner)
      .send({ title: 'Updated title', description: 'Updated description' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.media.title).toBe('Updated title');
    expect(patchRes.body.media.description).toBe('Updated description');

    const viewerDeleteRes = await request(app)
      .delete(`/api/trees/${treeId}/media/${mediaId}`)
      .set('Authorization', viewer);
    expect(viewerDeleteRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/trees/${treeId}/media/${mediaId}`)
      .set('Authorization', owner);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', owner);
    expect(listRes.body.media).toHaveLength(0);
  });

  it('denies a viewer from uploading media but allows listing and file access', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);

    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const uploadRes = await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', viewer)
      .field('kind', 'photo')
      .attach('file', Buffer.from('x'), 'a.jpg');
    expect(uploadRes.status).toBe(403);

    const ownerUploadRes = await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', owner)
      .field('kind', 'photo')
      .attach('file', Buffer.from('x'), 'a.jpg');

    const listRes = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', viewer);
    expect(listRes.status).toBe(200);

    const fileRes = await request(app).get(ownerUploadRes.body.media.url).set('Authorization', viewer);
    expect(fileRes.status).toBe(200);
  });

  it('404s a file request for media that belongs to a different tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);
    const otherTreeId = await createTree(owner);

    const uploadRes = await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', owner)
      .field('kind', 'photo')
      .attach('file', Buffer.from('x'), 'a.jpg');
    const mediaId = uploadRes.body.media.id;

    const fileRes = await request(app)
      .get(`/api/trees/${otherTreeId}/media/${mediaId}/file`)
      .set('Authorization', owner);
    expect(fileRes.status).toBe(404);
  });

  it('creates an album, adds media to it, and sets a cover', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);

    const uploadRes = await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', owner)
      .field('kind', 'photo')
      .attach('file', Buffer.from('x'), 'a.jpg');
    const mediaId = uploadRes.body.media.id;

    const albumRes = await request(app)
      .post(`/api/trees/${treeId}/albums`)
      .set('Authorization', owner)
      .send({ name: 'Summer Trip' });
    expect(albumRes.status).toBe(201);
    const albumId = albumRes.body.album.id;

    const addRes = await request(app)
      .post(`/api/trees/${treeId}/albums/${albumId}/media`)
      .set('Authorization', owner)
      .send({ mediaId });
    expect(addRes.status).toBe(201);

    const coverRes = await request(app)
      .patch(`/api/trees/${treeId}/albums/${albumId}/cover`)
      .set('Authorization', owner)
      .send({ mediaId });
    expect(coverRes.status).toBe(200);

    const getRes = await request(app).get(`/api/trees/${treeId}/albums/${albumId}`).set('Authorization', owner);
    expect(getRes.status).toBe(200);
    expect(getRes.body.album.cover_media_id).toBe(mediaId);
    expect(getRes.body.media).toHaveLength(1);
    expect(getRes.body.media[0].url).toBe(`/api/trees/${treeId}/media/${mediaId}/file`);
  });

  it('reports media usage across albums, events, and tags', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);

    const uploadRes = await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', owner)
      .field('kind', 'photo')
      .attach('file', Buffer.from('x'), 'a.jpg');
    const mediaId = uploadRes.body.media.id;

    const emptyUsageRes = await request(app).get(`/api/trees/${treeId}/media/${mediaId}/usage`).set('Authorization', owner);
    expect(emptyUsageRes.status).toBe(200);
    expect(emptyUsageRes.body).toEqual({ albums: [], events: [], taggedMemberCount: 0 });

    const albumRes = await request(app)
      .post(`/api/trees/${treeId}/albums`)
      .set('Authorization', owner)
      .send({ name: 'Summer Trip' });
    const albumId = albumRes.body.album.id;
    await request(app).post(`/api/trees/${treeId}/albums/${albumId}/media`).set('Authorization', owner).send({ mediaId });

    const eventRes = await request(app)
      .post(`/api/trees/${treeId}/events`)
      .set('Authorization', owner)
      .send({ title: 'Family Reunion' });
    const eventId = eventRes.body.event.id;
    await request(app).post(`/api/trees/${treeId}/events/${eventId}/media`).set('Authorization', owner).send({ mediaId });

    await request(app)
      .post(`/api/trees/${treeId}/media/${mediaId}/tags`)
      .set('Authorization', owner)
      .send({ memberId: 'person-1' });

    const usageRes = await request(app).get(`/api/trees/${treeId}/media/${mediaId}/usage`).set('Authorization', owner);
    expect(usageRes.status).toBe(200);
    expect(usageRes.body.albums).toEqual([{ id: albumId, name: 'Summer Trip' }]);
    expect(usageRes.body.events).toEqual([{ id: eventId, title: 'Family Reunion' }]);
    expect(usageRes.body.taggedMemberCount).toBe(1);

    // Removing the album link (not deleting the media) only drops that one usage.
    await request(app).delete(`/api/trees/${treeId}/albums/${albumId}/media/${mediaId}`).set('Authorization', owner);
    const afterUnlinkRes = await request(app).get(`/api/trees/${treeId}/media/${mediaId}/usage`).set('Authorization', owner);
    expect(afterUnlinkRes.body.albums).toEqual([]);
    expect(afterUnlinkRes.body.events).toEqual([{ id: eventId, title: 'Family Reunion' }]);

    const stillListedRes = await request(app).get(`/api/trees/${treeId}/media`).set('Authorization', owner);
    expect(stillListedRes.body.media).toHaveLength(1);
  });

  it('renames and deletes an album, denying a viewer either action', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);

    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const albumRes = await request(app)
      .post(`/api/trees/${treeId}/albums`)
      .set('Authorization', owner)
      .send({ name: 'Summer Trip' });
    const albumId = albumRes.body.album.id;

    const viewerRenameRes = await request(app)
      .patch(`/api/trees/${treeId}/albums/${albumId}`)
      .set('Authorization', viewer)
      .send({ name: 'Hacked name' });
    expect(viewerRenameRes.status).toBe(403);

    const renameRes = await request(app)
      .patch(`/api/trees/${treeId}/albums/${albumId}`)
      .set('Authorization', owner)
      .send({ name: 'Winter Trip' });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.album.name).toBe('Winter Trip');

    const viewerDeleteRes = await request(app)
      .delete(`/api/trees/${treeId}/albums/${albumId}`)
      .set('Authorization', viewer);
    expect(viewerDeleteRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/trees/${treeId}/albums/${albumId}`)
      .set('Authorization', owner);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app).get(`/api/trees/${treeId}/albums`).set('Authorization', owner);
    expect(listRes.body.albums).toHaveLength(0);
  });

  it('creates an event, adds a participant, and lists it on the tree timeline', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);

    const eventRes = await request(app)
      .post(`/api/trees/${treeId}/events`)
      .set('Authorization', owner)
      .send({ title: 'Family Reunion', eventDate: '2020-07-04', eventType: 'reunion' });
    expect(eventRes.status).toBe(201);
    const eventId = eventRes.body.event.id;

    const participantRes = await request(app)
      .post(`/api/trees/${treeId}/events/${eventId}/participants`)
      .set('Authorization', owner)
      .send({ memberId: 'person-1', role: 'honoree' });
    expect(participantRes.status).toBe(201);

    const timelineRes = await request(app)
      .get(`/api/trees/${treeId}/events`)
      .query({ memberId: 'person-1' })
      .set('Authorization', owner);
    expect(timelineRes.status).toBe(200);
    expect(timelineRes.body.events).toHaveLength(1);
    expect(timelineRes.body.events[0].id).toBe(eventId);
  });

  it('updates an event, attaches/detaches media, and denies a viewer either action', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);

    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const eventRes = await request(app)
      .post(`/api/trees/${treeId}/events`)
      .set('Authorization', owner)
      .send({ title: 'Family Reunion', eventDate: '2020-07-04' });
    const eventId = eventRes.body.event.id;

    const viewerPatchRes = await request(app)
      .patch(`/api/trees/${treeId}/events/${eventId}`)
      .set('Authorization', viewer)
      .send({ title: 'Hacked title' });
    expect(viewerPatchRes.status).toBe(403);

    const patchRes = await request(app)
      .patch(`/api/trees/${treeId}/events/${eventId}`)
      .set('Authorization', owner)
      .send({ title: 'Big Family Reunion', eventDate: '2021-08-15', location: 'Lake House' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.event.title).toBe('Big Family Reunion');
    expect(patchRes.body.event.location).toBe('Lake House');

    const uploadRes = await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', owner)
      .field('kind', 'photo')
      .attach('file', Buffer.from('x'), 'a.jpg');
    const mediaId = uploadRes.body.media.id;

    const attachRes = await request(app)
      .post(`/api/trees/${treeId}/events/${eventId}/media`)
      .set('Authorization', owner)
      .send({ mediaId });
    expect(attachRes.status).toBe(201);

    const getRes = await request(app).get(`/api/trees/${treeId}/events/${eventId}`).set('Authorization', owner);
    expect(getRes.body.media).toHaveLength(1);
    expect(getRes.body.media[0].id).toBe(mediaId);
    expect(getRes.body.media[0].url).toBe(`/api/trees/${treeId}/media/${mediaId}/file`);

    const detachRes = await request(app)
      .delete(`/api/trees/${treeId}/events/${eventId}/media/${mediaId}`)
      .set('Authorization', owner);
    expect(detachRes.status).toBe(200);

    const afterDetachRes = await request(app).get(`/api/trees/${treeId}/events/${eventId}`).set('Authorization', owner);
    expect(afterDetachRes.body.media).toHaveLength(0);
  });
});
