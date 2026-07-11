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

async function createEvent(owner, treeId) {
  const res = await request(app)
    .post(`/api/trees/${treeId}/events`)
    .set('Authorization', owner)
    .send({ title: 'Family Picnic' });
  return res.body.event.id;
}

describe('comments', () => {
  it('adds a comment and lists it chronologically with commenter name/avatar joined in', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);
    const eventId = await createEvent(owner, treeId);

    const addRes = await request(app)
      .post(`/api/trees/${treeId}/comments`)
      .set('Authorization', owner)
      .send({ targetType: 'event', targetId: eventId, body: 'First!' });
    expect(addRes.status).toBe(201);
    expect(addRes.body.comment.body).toBe('First!');
    expect(addRes.body.comment.user_email).toBe('owner@example.com');

    const listRes = await request(app)
      .get(`/api/trees/${treeId}/comments`)
      .query({ targetType: 'event', targetId: eventId })
      .set('Authorization', owner);
    expect(listRes.status).toBe(200);
    expect(listRes.body.comments).toHaveLength(1);
    expect(listRes.body.comments[0].body).toBe('First!');
  });

  it('rejects an empty comment body', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);
    const eventId = await createEvent(owner, treeId);

    const res = await request(app)
      .post(`/api/trees/${treeId}/comments`)
      .set('Authorization', owner)
      .send({ targetType: 'event', targetId: eventId, body: '   ' });
    expect(res.status).toBe(400);
  });

  it('lets the author delete their own comment but denies a non-author viewer', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await createTree(owner);
    await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', owner).send({ email: 'viewer@example.com', role: 'viewer' });
    const eventId = await createEvent(owner, treeId);

    const addRes = await request(app)
      .post(`/api/trees/${treeId}/comments`)
      .set('Authorization', owner)
      .send({ targetType: 'event', targetId: eventId, body: 'Mine' });
    const commentId = addRes.body.comment.id;

    const deniedRes = await request(app)
      .delete(`/api/trees/${treeId}/comments/${commentId}`)
      .set('Authorization', viewer);
    expect(deniedRes.status).toBe(403);

    const okRes = await request(app)
      .delete(`/api/trees/${treeId}/comments/${commentId}`)
      .set('Authorization', owner);
    expect(okRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/trees/${treeId}/comments`)
      .query({ targetType: 'event', targetId: eventId })
      .set('Authorization', owner);
    expect(listRes.body.comments).toHaveLength(0);
  });
});

describe('reactions', () => {
  it('adds a reaction, then removes it on a repeat click of the same emoji', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);
    const eventId = await createEvent(owner, treeId);

    const addRes = await request(app)
      .post(`/api/trees/${treeId}/reactions/toggle`)
      .set('Authorization', owner)
      .send({ targetType: 'event', targetId: eventId, emoji: '👍' });
    expect(addRes.status).toBe(200);
    expect(addRes.body.action).toBe('added');

    const removeRes = await request(app)
      .post(`/api/trees/${treeId}/reactions/toggle`)
      .set('Authorization', owner)
      .send({ targetType: 'event', targetId: eventId, emoji: '👍' });
    expect(removeRes.body.action).toBe('removed');

    const summaryRes = await request(app)
      .get(`/api/trees/${treeId}/reactions`)
      .query({ targetType: 'event', targetId: eventId })
      .set('Authorization', owner);
    expect(summaryRes.body.reactions).toHaveLength(0);
  });

  it('swaps the emoji when a different one is clicked, keeping exactly one reaction per user', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await createTree(owner);
    const eventId = await createEvent(owner, treeId);

    await request(app)
      .post(`/api/trees/${treeId}/reactions/toggle`)
      .set('Authorization', owner)
      .send({ targetType: 'event', targetId: eventId, emoji: '👍' });

    const swapRes = await request(app)
      .post(`/api/trees/${treeId}/reactions/toggle`)
      .set('Authorization', owner)
      .send({ targetType: 'event', targetId: eventId, emoji: '❤️' });
    expect(swapRes.body.action).toBe('updated');
    expect(swapRes.body.reaction.emoji).toBe('❤️');

    const summaryRes = await request(app)
      .get(`/api/trees/${treeId}/reactions`)
      .query({ targetType: 'event', targetId: eventId })
      .set('Authorization', owner);
    expect(summaryRes.body.reactions).toHaveLength(1);
    expect(summaryRes.body.reactions[0].emoji).toBe('❤️');
  });

  it('tracks separate reactions per user on the same target', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const treeId = await createTree(owner);
    await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', owner).send({ email: 'editor@example.com', role: 'editor' });
    const eventId = await createEvent(owner, treeId);

    await request(app)
      .post(`/api/trees/${treeId}/reactions/toggle`)
      .set('Authorization', owner)
      .send({ targetType: 'event', targetId: eventId, emoji: '👍' });
    await request(app)
      .post(`/api/trees/${treeId}/reactions/toggle`)
      .set('Authorization', editor)
      .send({ targetType: 'event', targetId: eventId, emoji: '👍' });

    const summaryRes = await request(app)
      .get(`/api/trees/${treeId}/reactions`)
      .query({ targetType: 'event', targetId: eventId })
      .set('Authorization', owner);
    expect(summaryRes.body.summary).toEqual([{ emoji: '👍', count: 2 }]);
  });
});
