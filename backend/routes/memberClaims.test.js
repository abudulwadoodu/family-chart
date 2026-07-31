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
const { query } = await import('../db/index.js');

function authHeader(sub, email) {
  return `Bearer ${sub}::${email}`;
}

async function asUser(sub, email) {
  await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return authHeader(sub, email);
}

async function setUpMember(treeId, ownerAuth, email, role) {
  const memberAuth = await asUser(`${email.split('@')[0]}-sub`, email);
  await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', ownerAuth).send({ email, role });
  return memberAuth;
}

beforeEach(async () => {
  await resetDb();
});

describe('member claim lifecycle', () => {
  it('lets a member propose a claim on a node and the owner approve it, exactly the join-then-claim scenario', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const seeker = await asUser('seeker-sub', 'seeker@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Seeker', 'last name': 'Person' }, rels: {} }] });

    // userB requests to join, userA approves - the existing access-grant flow.
    await request(app).post(`/api/trees/${treeId}/request-join`).set('Authorization', seeker).send({ role: 'viewer' });
    const manageRequestsRes = await request(app).get('/api/trees/manage-requests').set('Authorization', owner);
    const joinRequestId = manageRequestsRes.body.requests[0].id;
    await request(app).patch(`/api/trees/requests/${joinRequestId}`).set('Authorization', owner).send({ status: 'approved' });

    // Access alone doesn't establish identity - no claim exists yet.
    const beforeClaimRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', seeker);
    expect(beforeClaimRes.body.memberId).toBeNull();
    expect(beforeClaimRes.body.claimStatus).toBe('unclaimed');

    // userB now claims the node that represents them.
    const claimRes = await request(app)
      .post(`/api/trees/${treeId}/claims`)
      .set('Authorization', seeker)
      .send({ member_id: 'p1' });
    expect(claimRes.status).toBe(201);
    expect(claimRes.body.claim).toEqual(expect.objectContaining({ tree_id: treeId, member_id: 'p1', status: 'pending' }));

    const manageClaimsRes = await request(app).get('/api/trees/manage-claims').set('Authorization', owner);
    expect(manageClaimsRes.body.claims).toEqual([
      expect.objectContaining({ tree_id: treeId, member_id: 'p1', user_email: 'seeker@example.com', member_name: 'Seeker Person' }),
    ]);

    const claimId = manageClaimsRes.body.claims[0].id;
    const decideRes = await request(app).patch(`/api/trees/claims/${claimId}`).set('Authorization', owner).send({ status: 'approved' });
    expect(decideRes.status).toBe(200);

    const afterClaimRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', seeker);
    expect(afterClaimRes.body.memberId).toBe('p1');
    expect(afterClaimRes.body.claimStatus).toBe('approved');
    // The role granted by the join request approval must survive the claim approval unchanged.
    expect(afterClaimRes.body.role).toBe('viewer');

    const manageClaimsAfterRes = await request(app).get('/api/trees/manage-claims').set('Authorization', owner);
    expect(manageClaimsAfterRes.body.claims).toEqual([]);
  });

  it('lets the owner reject a claim without linking any member', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Node' }, rels: {} }] });
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', member).send({ member_id: 'p1' });
    const manageClaimsRes = await request(app).get('/api/trees/manage-claims').set('Authorization', owner);
    const claimId = manageClaimsRes.body.claims[0].id;

    const decideRes = await request(app).patch(`/api/trees/claims/${claimId}`).set('Authorization', owner).send({ status: 'rejected' });
    expect(decideRes.status).toBe(200);

    const memberTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', member);
    expect(memberTreeRes.body.memberId).toBeNull();
    expect(memberTreeRes.body.claimStatus).toBe('unclaimed');
  });

  it('rejects approving a second claim on a node someone else already claimed', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Contested' }, rels: {} }] });
    const memberA = await setUpMember(treeId, owner, 'member-a@example.com', 'viewer');
    const memberB = await setUpMember(treeId, owner, 'member-b@example.com', 'viewer');

    await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', memberA).send({ member_id: 'p1' });
    await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', memberB).send({ member_id: 'p1' });

    const manageClaimsRes = await request(app).get('/api/trees/manage-claims').set('Authorization', owner);
    expect(manageClaimsRes.body.claims).toHaveLength(2);
    const claimAId = manageClaimsRes.body.claims.find((c) => c.user_email === 'member-a@example.com').id;
    const claimBId = manageClaimsRes.body.claims.find((c) => c.user_email === 'member-b@example.com').id;

    const approveA = await request(app).patch(`/api/trees/claims/${claimAId}`).set('Authorization', owner).send({ status: 'approved' });
    expect(approveA.status).toBe(200);

    const approveB = await request(app).patch(`/api/trees/claims/${claimBId}`).set('Authorization', owner).send({ status: 'approved' });
    expect(approveB.status).toBe(409);

    const memberBTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', memberB);
    expect(memberBTreeRes.body.claimStatus).toBe('unclaimed');
  });

  it('blocks a user from claiming a second node once they already have an approved claim in the same tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({
        json_data: [
          { id: 'p1', data: { 'first name': 'First' }, rels: {} },
          { id: 'p2', data: { 'first name': 'Second' }, rels: {} },
        ],
      });
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', member).send({ member_id: 'p1' });
    const manageClaimsRes = await request(app).get('/api/trees/manage-claims').set('Authorization', owner);
    await request(app)
      .patch(`/api/trees/claims/${manageClaimsRes.body.claims[0].id}`)
      .set('Authorization', owner)
      .send({ status: 'approved' });

    const secondClaimRes = await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', member).send({ member_id: 'p2' });
    expect(secondClaimRes.status).toBe(409);
  });

  it('rejects a claim on a member id that does not exist in the tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    const res = await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', member).send({ member_id: 'does-not-exist' });
    expect(res.status).toBe(404);
  });

  it('blocks a non-member from proposing a claim', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const outsider = await asUser('outsider-sub', 'outsider@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: {}, rels: {} }] });

    const res = await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', outsider).send({ member_id: 'p1' });
    expect(res.status).toBe(403);
  });

  it('blocks a non-owner from deciding a claim', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const outsider = await asUser('outsider-sub', 'outsider@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: {}, rels: {} }] });
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', member).send({ member_id: 'p1' });
    const manageClaimsRes = await request(app).get('/api/trees/manage-claims').set('Authorization', owner);
    const claimId = manageClaimsRes.body.claims[0].id;

    const res = await request(app).patch(`/api/trees/claims/${claimId}`).set('Authorization', outsider).send({ status: 'approved' });
    expect(res.status).toBe(403);
  });

  it('lets a user see everything they have proposed via GET /my-claims', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Me' }, rels: {} }] });
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');

    await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', member).send({ member_id: 'p1' });

    const myClaimsRes = await request(app).get('/api/trees/my-claims').set('Authorization', member);
    expect(myClaimsRes.status).toBe(200);
    expect(myClaimsRes.body.claims).toEqual([
      expect.objectContaining({ tree_id: treeId, member_id: 'p1', status: 'pending', member_name: 'Me' }),
    ]);
  });

  it('never lets the legacy email auto-grant touch a row that already has an approved claim', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({
        json_data: [
          { id: 'p1', data: { 'first name': 'Claimed' }, rels: {} },
          { id: 'p2', data: { 'first name': 'EmailMatch', email: 'member@example.com' }, rels: {} },
        ],
      });
    await request(app).patch(`/api/trees/${treeId}/settings`).set('Authorization', owner).send({ email_auto_visibility: true });

    // Deliberately 'viewer' (not 'editor'): the pre-existing auto-grant WHERE
    // clause already skips editors/owners, so only 'viewer' actually
    // exercises the new claim_status guard rather than the old role guard.
    const member = await setUpMember(treeId, owner, 'member@example.com', 'viewer');
    await request(app).post(`/api/trees/${treeId}/claims`).set('Authorization', member).send({ member_id: 'p1' });
    const manageClaimsRes = await request(app).get('/api/trees/manage-claims').set('Authorization', owner);
    await request(app)
      .patch(`/api/trees/claims/${manageClaimsRes.body.claims[0].id}`)
      .set('Authorization', owner)
      .send({ status: 'approved' });

    // p2's email also matches this user - without the guard, discovery-check
    // would try to touch this tree_permissions row again.
    await request(app).post('/api/auth/discovery-check').set('Authorization', member);

    const { rows } = await query('SELECT role, member_id, claim_status FROM tree_permissions WHERE tree_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)', [
      treeId,
      'member@example.com',
    ]);
    expect(rows[0]).toEqual(expect.objectContaining({ role: 'viewer', member_id: 'p1', claim_status: 'approved' }));
  });
});
