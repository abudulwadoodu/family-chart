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

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const sendCalls = [];
  class CognitoIdentityProviderClient {
    async send(command) {
      sendCalls.push(command);
      return {};
    }
  }
  class AdminUserGlobalSignOutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class AdminDeleteUserCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { CognitoIdentityProviderClient, AdminUserGlobalSignOutCommand, AdminDeleteUserCommand, __sendCalls: sendCalls };
});

const { app } = await import('../app.js');
const { query } = await import('../db/index.js');
const cognitoMock = await import('@aws-sdk/client-cognito-identity-provider');

function authHeader(sub, email) {
  return `Bearer ${sub}::${email}`;
}

async function asUser(sub, email) {
  // Touch /api/auth/me once so the local user row exists before any other calls.
  const res = await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return { header: authHeader(sub, email), id: res.body.user.id };
}

beforeEach(async () => {
  await resetDb();
  cognitoMock.__sendCalls.length = 0;
});

describe('DELETE /api/account', () => {
  it('deletes an account that owns no trees and signs the user out of Cognito', async () => {
    const viewer = await asUser('viewer-sub', 'viewer@example.com');

    const res = await request(app).delete('/api/account').set('Authorization', viewer.header);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { rows } = await query('SELECT id FROM users WHERE id = $1', [viewer.id]);
    expect(rows[0]).toBeUndefined();

    expect(cognitoMock.__sendCalls).toHaveLength(2);
    expect(cognitoMock.__sendCalls[0].input).toMatchObject({ Username: 'viewer@example.com' });
    expect(cognitoMock.__sendCalls[1].input).toMatchObject({ Username: 'viewer@example.com' });
  });

  it('removes only the leaving member\'s permission on a tree they do not own', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner.header)
      .send({ email: 'editor@example.com', role: 'editor' });

    const res = await request(app).delete('/api/account').set('Authorization', editor.header);
    expect(res.status).toBe(200);

    const treeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner.header);
    expect(treeRes.status).toBe(200);

    const { rows: editorPermissionRows } = await query(
      'SELECT id FROM tree_permissions WHERE tree_id = $1 AND user_id = $2',
      [treeId, editor.id]
    );
    expect(editorPermissionRows[0]).toBeUndefined();
  });

  it('blocks deletion when the user solely owns a tree, and reports it in blockingTrees', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Solo Family' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner.header)
      .send({ email: 'editor@example.com', role: 'editor' });

    const res = await request(app).delete('/api/account').set('Authorization', owner.header);
    expect(res.status).toBe(409);
    expect(res.body.blockingTrees).toEqual([
      expect.objectContaining({
        id: treeId,
        name: 'Solo Family',
        editors: [expect.objectContaining({ userId: editor.id, email: 'editor@example.com' })],
        viewers: [],
      }),
    ]);
    expect(cognitoMock.__sendCalls).toHaveLength(0);

    const { rows: stillThereRows } = await query('SELECT id FROM users WHERE id = $1', [owner.id]);
    expect(stillThereRows[0]).toBeDefined();
  });

  it('lists both editors and viewers on a blocking tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Viewer Family' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner.header)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const checkRes = await request(app).get('/api/account/deletion-check').set('Authorization', owner.header);
    expect(checkRes.body.blockingTrees).toEqual([
      expect.objectContaining({
        id: treeId,
        editors: [],
        viewers: [expect.objectContaining({ userId: viewer.id, email: 'viewer@example.com' })],
      }),
    ]);
  });
});

describe('POST /api/account/trees/:id/transfer-ownership', () => {
  it('promotes an editor to owner and lets the original owner delete their account afterwards', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner.header)
      .send({ email: 'editor@example.com', role: 'editor' });

    const transferRes = await request(app)
      .post(`/api/account/trees/${treeId}/transfer-ownership`)
      .set('Authorization', owner.header)
      .send({ toUserId: editor.id });
    expect(transferRes.status).toBe(200);

    const newOwnerTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', editor.header);
    expect(newOwnerTreeRes.status).toBe(200);
    expect(newOwnerTreeRes.body.role).toBe('owner');

    const deleteRes = await request(app).delete('/api/account').set('Authorization', owner.header);
    expect(deleteRes.status).toBe(200);

    const survivingTreeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', editor.header);
    expect(survivingTreeRes.status).toBe(200);
  });

  it('rejects transferring to a user who is not a member of the tree', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const stranger = await asUser('stranger-sub', 'stranger@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;

    const res = await request(app)
      .post(`/api/account/trees/${treeId}/transfer-ownership`)
      .set('Authorization', owner.header)
      .send({ toUserId: stranger.id });
    expect(res.status).toBe(400);
  });

  it('blocks non-owners from transferring ownership of a tree they do not own', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner.header).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner.header)
      .send({ email: 'editor@example.com', role: 'editor' });

    const res = await request(app)
      .post(`/api/account/trees/${treeId}/transfer-ownership`)
      .set('Authorization', editor.header)
      .send({ toUserId: owner.id });
    expect(res.status).toBe(403);
  });
});
