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

function isoDaysFromToday(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('activity feed', () => {
  it('logs a media upload and an event creation, then lists both newest-first', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);

    await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', owner)
      .field('kind', 'photo')
      .field('title', 'Reunion')
      .attach('file', Buffer.from('x'), 'a.jpg');

    await request(app)
      .post(`/api/trees/${treeId}/events`)
      .set('Authorization', owner)
      .send({ title: 'Family Picnic' });

    const feedRes = await request(app).get(`/api/trees/${treeId}/activity`).set('Authorization', owner);
    expect(feedRes.status).toBe(200);
    const types = feedRes.body.activity.map((item) => item.activity_type);
    expect(types).toContain('media_added');
    expect(types).toContain('event_added');

    const eventItem = feedRes.body.activity.find((item) => item.activity_type === 'event_added');
    expect(eventItem.event_title).toBe('Family Picnic');
    expect(eventItem.actor_email).toBe('owner@example.com');
  });

  it('logs newly-added members on plain tree save, but not edits to existing members', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);

    // createTree seeds one default member (id "0" - see
    // utils/defaultTreeData.js) - the very first PUT below necessarily logs
    // p1 as "added" too, since it's replacing that seed. What this test
    // actually guards is the *second* PUT: saving again with p1 edited
    // (renamed) plus a genuinely new p2 must log only p2, not re-log p1.
    const initial = [{ id: 'p1', data: { 'first name': 'Ana', 'last name': 'Lopez', gender: 'F' }, rels: {} }];
    await request(app).put(`/api/trees/${treeId}`).set('Authorization', owner).send({ json_data: initial });

    const updated = [
      { id: 'p1', data: { 'first name': 'Ana', 'last name': 'Lopez-Renamed', gender: 'F' }, rels: {} },
      { id: 'p2', data: { 'first name': 'Ben', 'last name': 'Lopez', gender: 'M' }, rels: {} },
    ];
    await request(app).put(`/api/trees/${treeId}`).set('Authorization', owner).send({ json_data: updated });

    const feedRes = await request(app).get(`/api/trees/${treeId}/activity`).set('Authorization', owner);
    const memberAdded = feedRes.body.activity.filter((item) => item.activity_type === 'member_added');
    expect(memberAdded.map((item) => item.member_id).sort()).toEqual(['p1', 'p2']);
    // member_name is resolved live from current family_data, not snapshotted
    // at log time - p1's activity row reflects the post-rename name.
    expect(memberAdded.find((item) => item.member_id === 'p1').member_name).toBe('Ana Lopez-Renamed');
    expect(memberAdded.find((item) => item.member_id === 'p2').member_name).toBe('Ben Lopez');
  });

  it('computes a birthday entry for a member whose birthday is within the +/-7 day window, and excludes one outside it', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);

    const nearBirthday = isoDaysFromToday(3);
    const farBirthday = isoDaysFromToday(30);
    const people = [
      { id: 'p1', data: { 'first name': 'Close', 'last name': 'Birthday', birthday: `1990-${nearBirthday.slice(5)}`, gender: 'F' }, rels: {} },
      { id: 'p2', data: { 'first name': 'Far', 'last name': 'Birthday', birthday: `1990-${farBirthday.slice(5)}`, gender: 'M' }, rels: {} },
    ];
    await request(app).put(`/api/trees/${treeId}`).set('Authorization', owner).send({ json_data: people });

    const feedRes = await request(app).get(`/api/trees/${treeId}/activity`).set('Authorization', owner);
    const birthdays = feedRes.body.activity.filter((item) => item.activity_type === 'birthday');
    const birthdayMemberIds = birthdays.map((item) => item.member_id);
    expect(birthdayMemberIds).toContain('p1');
    expect(birthdayMemberIds).not.toContain('p2');
    expect(birthdays.find((item) => item.member_id === 'p1').age).toBe(new Date().getUTCFullYear() - 1990);
  });

  it('excludes activity referencing a private, non-shared media item from a viewer who cannot see it', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'viewer@example.com', 'viewer');

    await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', editorA)
      .field('kind', 'photo')
      .field('title', 'Private shot')
      .field('visibility', 'private')
      .attach('file', Buffer.from('x'), 'a.jpg');

    const viewerFeed = await request(app).get(`/api/trees/${treeId}/activity`).set('Authorization', viewer);
    expect(viewerFeed.body.activity.some((item) => item.activity_type === 'media_added')).toBe(false);

    const uploaderFeed = await request(app).get(`/api/trees/${treeId}/activity`).set('Authorization', editorA);
    expect(uploaderFeed.body.activity.some((item) => item.activity_type === 'media_added')).toBe(true);
  });

  it('excludes a stub-tier activity row entirely (owner moderating a shared-with-specific-people item)', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editorA = await asUser('editorA-sub', 'editora@example.com');
    const editorB = await asUser('editorB-sub', 'editorb@example.com');
    const treeId = await createTree(owner);
    await share(owner, treeId, 'editora@example.com', 'editor');
    await share(owner, treeId, 'editorb@example.com', 'editor');
    const editorBId = await userId(editorB);

    await request(app)
      .post(`/api/trees/${treeId}/media`)
      .set('Authorization', editorA)
      .field('kind', 'photo')
      .field('title', 'Shared shot')
      .field('visibility', 'private')
      .field('shareUserIds', JSON.stringify([editorBId]))
      .attach('file', Buffer.from('x'), 'a.jpg');

    const ownerFeed = await request(app).get(`/api/trees/${treeId}/activity`).set('Authorization', owner);
    expect(ownerFeed.body.activity.some((item) => item.activity_type === 'media_added')).toBe(false);

    const shareeFeed = await request(app).get(`/api/trees/${treeId}/activity`).set('Authorization', editorB);
    expect(shareeFeed.body.activity.some((item) => item.activity_type === 'media_added')).toBe(true);
  });

  it('denies a stranger with no tree access', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const stranger = await asUser('stranger-sub', 'stranger@example.com');
    const treeId = await createTree(owner);

    const res = await request(app).get(`/api/trees/${treeId}/activity`).set('Authorization', stranger);
    expect(res.status).toBe(403);
  });
});
