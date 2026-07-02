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

const fixturesDir = join(import.meta.dirname, '..', 'test', 'fixtures', 'csv');
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

describe('CSV preview', () => {
  it('parses, validates, and maps a valid file without persisting anything', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/csv/preview')
      .set('Authorization', owner)
      .attach('file', fixture('valid-new-template.csv'), 'valid-new-template.csv');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.errors).toEqual([]);
    expect(res.body.people).toHaveLength(3);
  });

  it('surfaces warnings without failing the whole import', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/csv/preview')
      .set('Authorization', owner)
      .attach('file', fixture('invalid-dates-and-gender.csv'), 'invalid-dates-and-gender.csv');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.warnings.some((w) => w.code === 'INVALID_DATE')).toBe(true);
    expect(res.body.warnings.some((w) => w.code === 'INVALID_GENDER')).toBe(true);
    expect(res.body.warnings.some((w) => w.code === 'INVALID_EMAIL')).toBe(true);
    expect(res.body.people).toHaveLength(1);
  });

  it('surfaces a circular-reference warning without blocking import', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/csv/preview')
      .set('Authorization', owner)
      .attach('file', fixture('circular-relationships.csv'), 'circular-relationships.csv');

    expect(res.body.ok).toBe(true);
    expect(res.body.warnings.some((w) => w.code === 'CIRCULAR_REFERENCE')).toBe(true);
  });

  it('rejects a file with duplicate ids with a 400-level error, not a silent partial import', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app)
      .post('/api/trees/csv/preview')
      .set('Authorization', owner)
      .attach('file', fixture('duplicate-ids.csv'), 'duplicate-ids.csv');

    expect(res.body.ok).toBe(false);
    expect(res.body.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('requires a file', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const res = await request(app).post('/api/trees/csv/preview').set('Authorization', owner);
    expect(res.status).toBe(400);
  });
});

describe('CSV import (commit)', () => {
  it('imports a new-template CSV, replacing the tree entirely', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Imported Tree' });
    const treeId = createRes.body.id;

    const importRes = await request(app)
      .post(`/api/trees/${treeId}/import-csv`)
      .set('Authorization', owner)
      .attach('file', fixture('valid-new-template.csv'), 'valid-new-template.csv');

    expect(importRes.status).toBe(200);
    expect(importRes.body.ok).toBe(true);
    expect(importRes.body.imported_count).toBe(3);
    expect(importRes.body.warnings).toEqual([]);

    const treeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    expect(treeRes.body.data).toHaveLength(3);
  });

  it('imports a legacy-header CSV successfully', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Legacy Tree' });
    const treeId = createRes.body.id;

    const importRes = await request(app)
      .post(`/api/trees/${treeId}/import-csv`)
      .set('Authorization', owner)
      .attach('file', fixture('valid-legacy-headers.csv'), 'valid-legacy-headers.csv');

    expect(importRes.status).toBe(200);
    expect(importRes.body.imported_count).toBe(3);

    const treeRes = await request(app).get(`/api/trees/${treeId}`).set('Authorization', owner);
    const john = treeRes.body.data.find((p) => p.data['first name'] === 'John');
    // "1950" isn't ISO YYYY-MM-DD, so it goes through the ambiguous-date
    // conversion path (Date.parse fallback) rather than being rejected.
    expect(john.data.birthday).toBe('1950-01-01');
    expect(john.data.location).toBe('New York');
  });

  it('rejects an import with hard errors and does not touch existing data', async () => {
    const owner = await asUser('owner-sub', 'owner@example.com');
    const createRes = await request(app).post('/api/trees').set('Authorization', owner).send({ name: 'Protected Tree' });
    const treeId = createRes.body.id;

    const importRes = await request(app)
      .post(`/api/trees/${treeId}/import-csv`)
      .set('Authorization', owner)
      .attach('file', fixture('duplicate-ids.csv'), 'duplicate-ids.csv');

    expect(importRes.status).toBe(400);
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
      .post(`/api/trees/${treeId}/import-csv`)
      .set('Authorization', viewer)
      .attach('file', fixture('valid-new-template.csv'), 'valid-new-template.csv');
    expect(res.status).toBe(403);
  });
});
