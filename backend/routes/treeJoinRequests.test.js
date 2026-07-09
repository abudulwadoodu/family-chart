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

describe('tree discovery search', () => {
  it('finds discoverable trees by name and reports membership status', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Smith Family Tree' });
    const treeId = createRes.body.id;

    const searchRes = await request(app).get('/api/trees/search').query({ query: 'Smith' }).set('Authorization', seeker);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.trees).toEqual([
      expect.objectContaining({ id: treeId, name: 'Smith Family Tree', ownerEmail: 'owner@example.com', membershipStatus: 'none' }),
    ]);
  });

  it('finds discoverable trees by a member\'s first name or last name', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({
        json_data: [
          { id: 'p1', data: { 'first name': 'Wadood', 'last name': 'Abdul' }, rels: {} },
        ],
      });

    const firstNameRes = await request(app).get('/api/trees/search').query({ query: 'Wadood' }).set('Authorization', seeker);
    expect(firstNameRes.body.trees).toEqual([expect.objectContaining({ id: treeId })]);

    const lastNameRes = await request(app).get('/api/trees/search').query({ query: 'Abdul' }).set('Authorization', seeker);
    expect(lastNameRes.body.trees).toEqual([expect.objectContaining({ id: treeId })]);
  });

  it('excludes trees that are not discoverable', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Hidden Family Tree' });
    const treeId = createRes.body.id;
    await request(app).patch(`/api/trees/${treeId}`).set('Authorization', owner).send({ name: 'Hidden Family Tree' });

    const { query } = await import('../db/index.js');
    await query('UPDATE trees SET is_discoverable = false WHERE id = $1', [treeId]);

    const searchRes = await request(app).get('/api/trees/search').query({ query: 'Hidden' }).set('Authorization', seeker);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.trees).toEqual([]);
  });

  it('requires a non-empty query', async () => {
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const res = await request(app).get('/api/trees/search').query({ query: '' }).set('Authorization', seeker);
    expect(res.status).toBe(400);
  });
});

describe('join request lifecycle', () => {
  it('lets a user request to join a tree and the owner approve it, granting the requested role', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const requestRes = await request(app)
      .post(`/api/trees/${treeId}/request-join`)
      .set('Authorization', seeker)
      .send({ role: 'editor' });
    expect(requestRes.status).toBe(201);
    expect(requestRes.body.request).toEqual(expect.objectContaining({ status: 'pending', role_requested: 'editor' }));

    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    expect(manageRes.status).toBe(200);
    expect(manageRes.body.requests).toEqual([
      expect.objectContaining({ tree_id: treeId, sender_email: 'seeker@example.com', role_requested: 'editor', status: 'pending' }),
    ]);

    const requestId = manageRes.body.requests[0].id;
    const decideRes = await request(app)
      .patch(`/api/trees/requests/${requestId}`)
      .set('Authorization', owner)
      .send({ status: 'approved' });
    expect(decideRes.status).toBe(200);

    const seekerTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', seeker);
    expect(seekerTreeRes.status).toBe(200);
    expect(seekerTreeRes.body.role).toBe('editor');

    const manageAfterRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    expect(manageAfterRes.body.requests).toEqual([]);
  });

  it('lets the owner reject a request without granting access', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    await request(app).post(`/api/trees/${treeId}/request-join`).set('Authorization', seeker).send({ role: 'viewer' });
    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    const requestId = manageRes.body.requests[0].id;

    const decideRes = await request(app)
      .patch(`/api/trees/requests/${requestId}`)
      .set('Authorization', owner)
      .send({ status: 'rejected' });
    expect(decideRes.status).toBe(200);

    const seekerTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', seeker);
    expect(seekerTreeRes.status).toBe(403);
  });

  it('emails the requester when their request is approved or rejected', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    await request(app).post(`/api/trees/${treeId}/request-join`).set('Authorization', seeker).send({ role: 'viewer' });
    // One email already went to the owner when the request was created.
    expect(sendMock).toHaveBeenCalledTimes(1);

    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    const requestId = manageRes.body.requests[0].id;

    await request(app).patch(`/api/trees/requests/${requestId}`).set('Authorization', owner).send({ status: 'rejected' });
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('lets a requester see the status of everything they have sent via GET /my-requests', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const treeA = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' })).body.id;
    const treeB = (await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family B' })).body.id;

    await request(app).post(`/api/trees/${treeA}/request-join`).set('Authorization', seeker).send({ role: 'viewer' });
    await request(app).post(`/api/trees/${treeB}/request-join`).set('Authorization', seeker).send({ role: 'editor' });

    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    const requestForTreeA = manageRes.body.requests.find((r) => r.tree_id === treeA);
    await request(app)
      .patch(`/api/trees/requests/${requestForTreeA.id}`)
      .set('Authorization', owner)
      .send({ status: 'rejected' });

    const myRequestsRes = await request(app).get('/api/trees/my-requests').set('Authorization', seeker);
    expect(myRequestsRes.status).toBe(200);
    expect(myRequestsRes.body.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tree_id: treeA, status: 'rejected', owner_email: 'owner@example.com' }),
        expect.objectContaining({ tree_id: treeB, status: 'pending', owner_email: 'owner@example.com' }),
      ])
    );
  });

  it('rejects a second pending request for the same tree from the same user', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    await request(app).post(`/api/trees/${treeId}/request-join`).set('Authorization', seeker).send({ role: 'viewer' });
    const dupeRes = await request(app)
      .post(`/api/trees/${treeId}/request-join`)
      .set('Authorization', seeker)
      .send({ role: 'editor' });
    expect(dupeRes.status).toBe(409);
  });

  it('rejects a join request from an existing member', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/trees/${treeId}/request-join`)
      .set('Authorization', owner)
      .send({ role: 'editor' });
    expect(res.status).toBe(409);
  });

  it('blocks a non-owner from deciding a join request', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const outsider = await asUser('outsider-sub', 'outsider@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    await request(app).post(`/api/trees/${treeId}/request-join`).set('Authorization', seeker).send({ role: 'viewer' });
    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    const requestId = manageRes.body.requests[0].id;

    const decideRes = await request(app)
      .patch(`/api/trees/requests/${requestId}`)
      .set('Authorization', outsider)
      .send({ status: 'approved' });
    expect(decideRes.status).toBe(403);
  });

  it('rejects an invalid role on request-join', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/trees/${treeId}/request-join`)
      .set('Authorization', seeker)
      .send({ role: 'owner' });
    expect(res.status).toBe(400);
  });

  it('stores and surfaces an optional message to the owner', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const requestRes = await request(app)
      .post(`/api/trees/${treeId}/request-join`)
      .set('Authorization', seeker)
      .send({ role: 'viewer', message: "I'm your cousin on the Smith side." });
    expect(requestRes.status).toBe(201);
    expect(requestRes.body.request.message).toBe("I'm your cousin on the Smith side.");

    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    expect(manageRes.body.requests).toEqual([
      expect.objectContaining({ message: "I'm your cousin on the Smith side." }),
    ]);
  });

  it('accepts a request with no message', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const requestRes = await request(app)
      .post(`/api/trees/${treeId}/request-join`)
      .set('Authorization', seeker)
      .send({ role: 'viewer' });
    expect(requestRes.status).toBe(201);
    expect(requestRes.body.request.message).toBeNull();
  });

  it('rejects a message longer than 500 characters', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/trees/${treeId}/request-join`)
      .set('Authorization', seeker)
      .send({ role: 'viewer', message: 'a'.repeat(501) });
    expect(res.status).toBe(400);
  });
});

describe('role change requests', () => {
  async function setUpMember(treeId, ownerAuth, email, role) {
    const memberAuth = await asUser(`${email.split('@')[0]}-sub`, email);
    await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', ownerAuth).send({ email, role });
    return memberAuth;
  }

  it('lets an existing viewer request an upgrade to editor, and approval grants the new role', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    const requestRes = await request(app)
      .post(`/api/trees/${treeId}/request-role-change`)
      .set('Authorization', member)
      .send({ role: 'editor', message: 'I help maintain this tree now.' });
    expect(requestRes.status).toBe(201);
    expect(requestRes.body.request).toEqual(
      expect.objectContaining({ status: 'pending', role_requested: 'editor', request_type: 'role_change' })
    );

    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    expect(manageRes.body.requests).toEqual([
      expect.objectContaining({ tree_id: treeId, role_requested: 'editor', request_type: 'role_change' }),
    ]);

    const requestId = manageRes.body.requests[0].id;
    const decideRes = await request(app)
      .patch(`/api/trees/requests/${requestId}`)
      .set('Authorization', owner)
      .send({ status: 'approved' });
    expect(decideRes.status).toBe(200);

    const memberTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', member);
    expect(memberTreeRes.body.role).toBe('editor');
  });

  it('leaves the role unchanged when the owner rejects a role change request', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    await request(app).post(`/api/trees/${treeId}/request-role-change`).set('Authorization', member).send({ role: 'editor' });
    const manageRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    const requestId = manageRes.body.requests[0].id;

    await request(app).patch(`/api/trees/requests/${requestId}`).set('Authorization', owner).send({ status: 'rejected' });

    const memberTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', member);
    expect(memberTreeRes.body.role).toBe('viewer');
  });

  it('blocks a non-member from requesting a role change', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const outsider = await asUser('outsider-sub', 'outsider@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/trees/${treeId}/request-role-change`)
      .set('Authorization', outsider)
      .send({ role: 'editor' });
    expect(res.status).toBe(403);
  });

  it('blocks the owner from requesting a role change on their own tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/trees/${treeId}/request-role-change`)
      .set('Authorization', owner)
      .send({ role: 'editor' });
    expect(res.status).toBe(403);
  });

  it('rejects requesting the role the member already has', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    const res = await request(app)
      .post(`/api/trees/${treeId}/request-role-change`)
      .set('Authorization', member)
      .send({ role: 'viewer' });
    expect(res.status).toBe(400);
  });

  it('rejects a second pending role change request from the same member', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    await request(app).post(`/api/trees/${treeId}/request-role-change`).set('Authorization', member).send({ role: 'editor' });
    const dupeRes = await request(app)
      .post(`/api/trees/${treeId}/request-role-change`)
      .set('Authorization', member)
      .send({ role: 'editor' });
    expect(dupeRes.status).toBe(409);
  });

  it('shows role-change requests in the requester\'s My Requests list', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    await request(app).post(`/api/trees/${treeId}/request-role-change`).set('Authorization', member).send({ role: 'editor' });

    const myRequestsRes = await request(app).get('/api/trees/my-requests').set('Authorization', member);
    expect(myRequestsRes.body.requests).toEqual([
      expect.objectContaining({ tree_id: treeId, request_type: 'role_change', role_requested: 'editor', status: 'pending' }),
    ]);
  });
});
