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

function tokenFor(sub, email) {
  return `${sub}::${email}`;
}

beforeEach(async () => {
  await resetDb();
});

describe('GET /api/auth/me', () => {
  it('rejects requests without a bearer token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('auto-creates a local user on first sight and returns it', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor('sub-1', 'first@example.com')}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('first@example.com');
    expect(res.body.user.last_login_at).toBeTruthy();

    const { rows } = await query('SELECT COUNT(*) AS count FROM users WHERE cognito_sub = $1', ['sub-1']);
    expect(Number(rows[0].count)).toBe(1);
  });

  it('reuses the existing local user on subsequent requests with the same sub', async () => {
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor('sub-2', 'second@example.com')}`);
    const second = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor('sub-2', 'second@example.com')}`);

    expect(second.status).toBe(200);
    const { rows } = await query('SELECT COUNT(*) AS count FROM users WHERE cognito_sub = $1', ['sub-2']);
    expect(Number(rows[0].count)).toBe(1);
  });
});

describe('POST /api/auth/discovery-check', () => {
  async function asUser(sub, email) {
    const header = `Bearer ${tokenFor(sub, email)}`;
    await request(app).get('/api/auth/me').set('Authorization', header);
    return header;
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/auth/discovery-check');
    expect(res.status).toBe(401);
  });

  it('grants viewer access to a matching tree with email_auto_visibility enabled', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const matcher = await asUser('matcher-sub', 'matcher@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Matcher', email: 'matcher@example.com' }, rels: {} }] });
    await request(app).patch(`/api/trees/${treeId}/settings`).set('Authorization', owner).send({ email_auto_visibility: true });

    const res = await request(app).post('/api/auth/discovery-check').set('Authorization', matcher);
    expect(res.status).toBe(200);
    expect(res.body.grantedTreeIds).toEqual([treeId]);

    const { rows } = await query('SELECT role FROM tree_permissions tp JOIN users u ON u.id = tp.user_id WHERE tp.tree_id = $1 AND u.email = $2', [
      treeId,
      'matcher@example.com',
    ]);
    expect(rows[0].role).toBe('viewer');
  });

  it('does not grant access when email_auto_visibility is disabled', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const matcher = await asUser('matcher-sub', 'matcher@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Matcher', email: 'matcher@example.com' }, rels: {} }] });

    const res = await request(app).post('/api/auth/discovery-check').set('Authorization', matcher);
    expect(res.status).toBe(200);
    expect(res.body.grantedTreeIds).toEqual([]);
  });

  it('does not downgrade an existing editor or owner', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const editor = await asUser('editor-sub', 'editor@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Editor', email: 'editor@example.com' }, rels: {} }] });
    await request(app).patch(`/api/trees/${treeId}/settings`).set('Authorization', owner).send({ email_auto_visibility: true });
    await request(app).post(`/api/trees/${treeId}/share`).set('Authorization', owner).send({ email: 'editor@example.com', role: 'editor' });

    await request(app).post('/api/auth/discovery-check').set('Authorization', editor);

    const { rows } = await query('SELECT role FROM tree_permissions tp JOIN users u ON u.id = tp.user_id WHERE tp.tree_id = $1 AND u.email = $2', [
      treeId,
      'editor@example.com',
    ]);
    expect(rows[0].role).toBe('editor');
  });

  it('is idempotent across repeated calls', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const matcher = await asUser('matcher-sub', 'matcher@example.com');

    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({ json_data: [{ id: 'p1', data: { 'first name': 'Matcher', email: 'matcher@example.com' }, rels: {} }] });
    await request(app).patch(`/api/trees/${treeId}/settings`).set('Authorization', owner).send({ email_auto_visibility: true });

    await request(app).post('/api/auth/discovery-check').set('Authorization', matcher);
    const second = await request(app).post('/api/auth/discovery-check').set('Authorization', matcher);
    expect(second.status).toBe(200);
    expect(second.body.grantedTreeIds).toEqual([treeId]);

    const { rows } = await query('SELECT COUNT(*) AS count FROM tree_permissions WHERE tree_id = $1', [treeId]);
    expect(Number(rows[0].count)).toBe(2); // owner + matcher, no duplicates
  });
});
