import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { setBaseTestEnv, resetDb } from '../test/testEnv.js';

setBaseTestEnv();

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({
      verify: async (token) => {
        const [sub, email] = token.split('::');
        return { sub, email };
      },
    }),
  },
}));

const { app } = await import('../app.js');

const fixturesDir = join(import.meta.dirname, '..', 'test', 'fixtures', 'json');
const fixture = (name) => readFileSync(join(fixturesDir, name));

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

describe('JSON preview', () => {
  it('accepts a legacy bare-array export', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/json/preview')
      .set('Authorization', owner)
      .attach('file', fixture('legacy-array.json'), 'legacy-array.json');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.people).toHaveLength(1);
  });

  it('accepts a versioned v2 export', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/json/preview')
      .set('Authorization', owner)
      .attach('file', fixture('versioned-v2.json'), 'versioned-v2.json');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.people[0].data['first name']).toBe('John');
  });

  it('requires a file', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app).post('/api/trees/json/preview').set('Authorization', owner);
    expect(res.status).toBe(400);
  });
});

describe('JSON import (commit)', () => {
  it('imports a versioned export, replacing the tree entirely', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Imported Tree' });
    const treeId = createRes.body.id;

    const importRes = await request(app)
      .post(`/api/trees/${treeId}/import-json`)
      .set('Authorization', owner)
      .attach('file', fixture('versioned-v2.json'), 'versioned-v2.json');

    expect(importRes.status).toBe(200);
    expect(importRes.body.imported_count).toBe(1);

    const treeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    expect(treeRes.body.data).toHaveLength(1);
  });

  it('imports a legacy bare-array export', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Legacy Tree' });
    const treeId = createRes.body.id;

    const importRes = await request(app)
      .post(`/api/trees/${treeId}/import-json`)
      .set('Authorization', owner)
      .attach('file', fixture('legacy-array.json'), 'legacy-array.json');

    expect(importRes.status).toBe(200);
    expect(importRes.body.imported_count).toBe(1);
  });

  it('blocks viewers from importing', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Family A' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const res = await request(app)
      .post(`/api/trees/${treeId}/import-json`)
      .set('Authorization', viewer)
      .attach('file', fixture('legacy-array.json'), 'legacy-array.json');
    expect(res.status).toBe(403);
  });
});

describe('JSON export', () => {
  it('exports a tree as a versioned envelope', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Export Tree' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({
        json_data: [
          { id: 'p1', data: { 'first name': 'John', 'last name': 'Doe', gender: 'M' }, rels: { parents: [], children: [], spouses: [] } },
        ],
      });

    const res = await request(app).get(`/api/trees/${treeId}/export-json`).set('Authorization', owner);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.envelope.version).toBe('2.0');
    expect(res.body.envelope.application).toBe('FamilyChart');
    expect(typeof res.body.envelope.exportedAt).toBe('string');
    expect(res.body.envelope.tree.people).toHaveLength(1);
    expect(res.body.envelope.tree.people[0].name.first).toBe('John');
  });

  it('allows viewers to export', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Export Tree' });
    const treeId = createRes.body.id;
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const res = await request(app).get(`/api/trees/${treeId}/export-json`).set('Authorization', viewer);
    expect(res.status).toBe(200);
  });
});
