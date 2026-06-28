import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { setBaseTestEnv } from '../test/testEnv.js';

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
const { getDb } = await import('../db/index.js');

const fixturesDir = join(import.meta.dirname, '..', 'test', 'fixtures', 'gedcom');
const fixture = (name) => readFileSync(join(fixturesDir, name));

function authHeader(sub, email) {
  return `Bearer ${sub}::${email}`;
}

async function asUser(sub, email) {
  await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return authHeader(sub, email);
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM tree_permissions');
  db.exec('DELETE FROM family_data');
  db.exec('DELETE FROM trees');
  db.exec('DELETE FROM users');
});

describe('GEDCOM preview', () => {
  it('parses, validates, and maps a valid file without persisting anything', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/gedcom/preview')
      .set('Authorization', owner)
      .attach('file', fixture('simple-family.ged'), 'simple-family.ged');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.summary.individuals).toBe(3);
    expect(res.body.summary.families).toBe(1);
    expect(res.body.errors).toEqual([]);
    expect(res.body.people).toHaveLength(3);
  });

  it('surfaces warnings for a file with unsupported tags and a broken reference', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/gedcom/preview')
      .set('Authorization', owner)
      .attach('file', fixture('unknown-tags.ged'), 'unknown-tags.ged');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.warnings.some((w) => w.code === 'UNSUPPORTED_TAG')).toBe(true);
  });

  it('rejects a malformed file with a 400 and a clear error', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/gedcom/preview')
      .set('Authorization', owner)
      .attach('file', fixture('invalid.ged'), 'invalid.ged');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not valid GEDCOM/);
  });

  it('requires a file', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app).post('/api/trees/gedcom/preview').set('Authorization', owner);
    expect(res.status).toBe(400);
  });
});

describe('GEDCOM import (commit)', () => {
  it('imports a GEDCOM file into a freshly created tree, discarding the seeded starter person', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Imported Tree' });
    const treeId = createRes.body.id;

    const importRes = await request(app)
      .post(`/api/trees/${treeId}/import-gedcom`)
      .set('Authorization', owner)
      .attach('file', fixture('simple-family.ged'), 'simple-family.ged');

    expect(importRes.status).toBe(200);
    expect(importRes.body.ok).toBe(true);
    expect(importRes.body.imported_count).toBe(3);
    expect(importRes.body.skipped_count).toBe(0);
    expect(importRes.body.added_ids).toHaveLength(3);

    // GEDCOM import replaces a tree's entire contents, the same as CSV/JSON
    // import already does - the seeded starter person (see
    // getDefaultTreeDataJson) should not survive alongside the import.
    const treeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    expect(treeRes.body.data).toHaveLength(3);
  });

  it('replaces an existing tree\'s data entirely, discarding whatever was there before', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Existing Tree' });
    const treeId = createRes.body.id;

    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({
        json_data: [
          { id: 'existing-1', data: { 'first name': 'John', 'last name': 'Doe', gender: 'M', birthday: '1 JAN 1950' }, rels: { parents: [], children: [], spouses: [] } },
        ],
      });

    const importRes = await request(app)
      .post(`/api/trees/${treeId}/import-gedcom`)
      .set('Authorization', owner)
      .attach('file', fixture('simple-family.ged'), 'simple-family.ged');

    expect(importRes.status).toBe(200);
    expect(importRes.body.skipped_count).toBe(0);
    expect(importRes.body.imported_count).toBe(3);

    const treeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    expect(treeRes.body.data).toHaveLength(3);
    expect(treeRes.body.data.find((p) => p.id === 'existing-1')).toBeUndefined();
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
      .post(`/api/trees/${treeId}/import-gedcom`)
      .set('Authorization', viewer)
      .attach('file', fixture('simple-family.ged'), 'simple-family.ged');
    expect(res.status).toBe(403);
  });
});

describe('GEDCOM export', () => {
  async function setupTreeWithPeople(owner) {
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Export Tree' });
    const treeId = createRes.body.id;
    await request(app)
      .put(`/api/trees/${treeId}`)
      .set('Authorization', owner)
      .send({
        json_data: [
          { id: 'p1', data: { 'first name': 'Live', 'last name': 'One', gender: 'F' }, rels: { parents: [], children: [], spouses: [] } },
          { id: 'p2', data: { 'first name': 'Dead', 'last name': 'One', gender: 'M', death: '2000' }, rels: { parents: [], children: [], spouses: [] } },
        ],
      });
    return treeId;
  }

  it('exports a tree as GEDCOM text', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await setupTreeWithPeople(owner);

    const res = await request(app).get(`/api/trees/${treeId}/export-gedcom`).set('Authorization', owner);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.gedcom).toContain('0 HEAD');
    expect(res.body.gedcom).toContain('Live');
    expect(res.body.gedcom).toContain('Dead');
  });

  it('excludes deceased individuals when includeDeceased=false', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const treeId = await setupTreeWithPeople(owner);

    const res = await request(app)
      .get(`/api/trees/${treeId}/export-gedcom?includeDeceased=false`)
      .set('Authorization', owner);
    expect(res.body.gedcom).toContain('Live');
    expect(res.body.gedcom).not.toContain('Dead');
  });

  it('allows viewers to export', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const viewer = await asUser('viewer-sub', 'viewer@example.com');
    const treeId = await setupTreeWithPeople(owner);
    await request(app)
      .post(`/api/trees/${treeId}/share`)
      .set('Authorization', owner)
      .send({ email: 'viewer@example.com', role: 'viewer' });

    const res = await request(app).get(`/api/trees/${treeId}/export-gedcom`).set('Authorization', viewer);
    expect(res.status).toBe(200);
  });
});
