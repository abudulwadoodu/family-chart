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

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
  SendRawEmailCommand: vi.fn().mockImplementation((input) => ({ input })),
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
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

describe('share-link configuration', () => {
  it('defaults to restricted with no token for a newly created tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;

    const res = await request(app).get(`/api/trees/${treeId}/share-link`).set('Authorization', owner);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ share_token: null, link_access: 'restricted' });
  });

  it('generates a share token the first time link access is turned on', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;

    const res = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view' });
    expect(res.status).toBe(200);
    expect(res.body.link_access).toBe('view');
    expect(typeof res.body.share_token).toBe('string');
    expect(res.body.share_token.length).toBeGreaterThan(10);
  });

  it('keeps the same token across restricted -> view -> restricted -> view toggles', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;

    const firstOn = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view' });
    const token = firstOn.body.share_token;

    await request(app).patch(`/api/trees/${treeId}/share-link`).set('Authorization', owner).send({ link_access: 'restricted' });

    const secondOn = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view' });
    expect(secondOn.body.share_token).toBe(token);
  });

  it('reset generates a new token that invalidates the old one', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;

    const enableRes = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view' });
    const oldToken = enableRes.body.share_token;

    const resetRes = await request(app).post(`/api/trees/${treeId}/share-link/reset`).set('Authorization', owner);
    expect(resetRes.status).toBe(200);
    const newToken = resetRes.body.share_token;
    expect(newToken).not.toBe(oldToken);

    const oldLookup = await request(app).get(`/api/public/trees/${oldToken}`);
    expect(oldLookup.status).toBe(404);

    const newLookup = await request(app).get(`/api/public/trees/${newToken}`);
    expect(newLookup.status).toBe(200);
  });

  it('rejects an invalid link_access value', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;

    const res = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'public' });
    expect(res.status).toBe(400);
  });

  it('blocks a non-owner from reading or changing share-link settings', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', owner).send({ email: 'editor@example.com', role: 'editor' });

    const getRes = await request(app).get(`/api/trees/${treeId}/share-link`).set('Authorization', editor);
    expect(getRes.status).toBe(403);

    const patchRes = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', editor)
      .send({ link_access: 'view' });
    expect(patchRes.status).toBe(403);
  });
});

describe('public share-link viewer', () => {
  it('returns tree data for a valid token with link access enabled', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Ada', 'last name': 'Lovelace' }, rels: {} }] });

    const enableRes = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view' });
    const token = enableRes.body.share_token;

    const publicRes = await request(app).get(`/api/public/trees/${token}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.tree).toEqual(expect.objectContaining({ id: treeId, name: 'Family A' }));
    expect(publicRes.body.data).toEqual([expect.objectContaining({ id: 'p1' })]);
  });

  it('404s for an unknown token', async () => {
    const res = await request(app).get('/api/public/trees/not-a-real-token');
    expect(res.status).toBe(404);
  });

  it('404s once link access has been turned back to restricted', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;

    const enableRes = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view' });
    const token = enableRes.body.share_token;

    await request(app).patch(`/api/trees/${treeId}/share-link`).set('Authorization', owner).send({ link_access: 'restricted' });

    const publicRes = await request(app).get(`/api/public/trees/${token}`);
    expect(publicRes.status).toBe(404);
  });

  it('404s for a disabled tree even with a valid token', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;

    const enableRes = await request(app)
      .patch(`/api/trees/${treeId}/share-link`)
      .set('Authorization', owner)
      .send({ link_access: 'view' });
    const token = enableRes.body.share_token;

    await request(app).patch(`/api/trees/${treeId}/status`).set('Authorization', owner).send({ status: 'disabled' });

    const publicRes = await request(app).get(`/api/public/trees/${token}`);
    expect(publicRes.status).toBe(404);
  });
});

describe('request-join-via-link', () => {
  it('creates a pending editor join request without requiring the tree to be discoverable', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    await request(app).patch(`/api/trees/${treeId}/share-link`).set('Authorization', owner).send({ link_access: 'view' });

    const res = await request(app)
      .post(`/api/trees/${treeId}/request-join-via-link`)
      .set('Authorization', seeker)
      .send({ message: 'Found this via the shared link.' });
    expect(res.status).toBe(201);
    expect(res.body.request).toEqual(expect.objectContaining({ status: 'pending', role_requested: 'editor' }));

    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    expect(manageRes.body.requests).toEqual([
      expect.objectContaining({ tree_id: treeId, sender_email: 'seeker@example.com', role_requested: 'editor' }),
    ]);
  });

  it('404s when link access is restricted', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;

    const res = await request(app).post(`/api/trees/${treeId}/request-join-via-link`).set('Authorization', seeker).send({});
    expect(res.status).toBe(404);
  });

  it('rejects a message over 500 characters', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const treeId = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    await request(app).patch(`/api/trees/${treeId}/share-link`).set('Authorization', owner).send({ link_access: 'view' });

    const res = await request(app)
      .post(`/api/trees/${treeId}/request-join-via-link`)
      .set('Authorization', seeker)
      .send({ message: 'a'.repeat(501) });
    expect(res.status).toBe(400);
  });
});
