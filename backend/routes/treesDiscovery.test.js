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

describe('GET /api/trees/discovery', () => {
  it('finds a tree whose family_data contains a person-node matching the requester\'s email', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Seeker', email: '  Seeker@Example.com  ' }, rels: {} }] });

    const res = await request(app).get('/api/trees/discovery').set('Authorization', seeker);
    expect(res.status).toBe(200);
    expect(res.body.trees).toEqual([expect.objectContaining({ id: treeId, name: 'Family A', ownerEmail: 'owner@example.com' })]);
  });

  it('does not match when data.email is empty or genuinely different', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({
        json_data: [
          { id: 'p1', data: { 'first name': 'Nobody', email: '' }, rels: {} },
          { id: 'p2', data: { 'first name': 'Someone Else', email: 'someone-else@example.com' }, rels: {} },
        ],
      });

    const res = await request(app).get('/api/trees/discovery').set('Authorization', seeker);
    expect(res.status).toBe(200);
    expect(res.body.trees).toEqual([]);
  });

  it('excludes a tree the requester is already a member of', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const member = await asUser('member-sub', 'member@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Member', email: 'member@example.com' }, rels: {} }] });
    await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', owner).send({ email: 'member@example.com', role: 'viewer' });

    const res = await request(app).get('/api/trees/discovery').set('Authorization', member);
    expect(res.body.trees).toEqual([]);
  });

  it('excludes a tree the requester already has a pending join request for', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Seeker', email: 'seeker@example.com' }, rels: {} }] });
    await request(app).post(`/api/trees/${treeId}/request-join`).set('Authorization', seeker).send({ role: 'viewer' });

    const res = await request(app).get('/api/trees/discovery').set('Authorization', seeker);
    expect(res.body.trees).toEqual([]);
  });

  it('includes trees that are not is_discoverable, unlike the name-search endpoint', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Hidden Family' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Seeker', email: 'seeker@example.com' }, rels: {} }] });

    const { query } = await import('../db/index.js');
    await query('UPDATE trees SET is_discoverable = false WHERE id = $1', [treeId]);

    const res = await request(app).get('/api/trees/discovery').set('Authorization', seeker);
    expect(res.body.trees).toEqual([expect.objectContaining({ id: treeId })]);
  });

  it('lets the requester send a join request using a treeId sourced from discovery', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Seeker', email: 'seeker@example.com' }, rels: {} }] });

    const discoveryRes = await request(app).get('/api/trees/discovery').set('Authorization', seeker);
    const discoveredTreeId = discoveryRes.body.trees[0].id;

    const joinRes = await request(app)
      .post(`/api/trees/${discoveredTreeId}/request-join`)
      .set('Authorization', seeker)
      .send({ role: 'viewer' });
    expect(joinRes.status).toBe(201);

    const afterRes = await request(app).get('/api/trees/discovery').set('Authorization', seeker);
    expect(afterRes.body.trees).toEqual([]);
  });
});
