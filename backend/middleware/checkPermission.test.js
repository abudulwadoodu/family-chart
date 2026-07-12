import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';

import { setBaseTestEnv, resetDb } from '../test/testEnv.js';

setBaseTestEnv();

const { query } = await import('../db/index.js');
const { checkPermission } = await import('./checkPermission.js');
const { grantOverride } = await import('../models/specialAccessModel.js');

beforeEach(async () => {
  await resetDb();
});

function buildApp(requiredAction) {
  const app = express();
  app.use((req, _res, next) => {
    const userId = Number(req.headers['x-user-id']);
    const adminRole = req.headers['x-admin-role'] || null;
    req.user = { id: userId, adminRole };
    next();
  });
  app.get('/api/trees/:treeId/events/:eventId', checkPermission(requiredAction), (req, res) => {
    res.json({ ok: true, override: req.specialAccessOverride || null });
  });
  app.get('/api/trees/:treeId', checkPermission(requiredAction), (req, res) => {
    res.json({ ok: true });
  });
  return app;
}

async function createUser(email) {
  const { rows } = await query('INSERT INTO users (email, cognito_sub) VALUES ($1, $2) RETURNING id', [
    email,
    `${email}-sub`,
  ]);
  return rows[0].id;
}

async function createTree(ownerId) {
  const { rows } = await query('INSERT INTO trees (name, owner_id) VALUES ($1, $2) RETURNING id', ['Tree', ownerId]);
  await query("INSERT INTO tree_permissions (tree_id, user_id, role) VALUES ($1, $2, 'owner')", [rows[0].id, ownerId]);
  return rows[0].id;
}

async function createEvent(treeId, createdBy) {
  const { rows } = await query('INSERT INTO events (tree_id, title, created_by) VALUES ($1, $2, $3) RETURNING id', [
    treeId,
    'Reunion',
    createdBy,
  ]);
  return rows[0].id;
}

describe('checkPermission', () => {
  it('rejects an unrecognized action at construction time', () => {
    expect(() => checkPermission('delete')).toThrow(/read.*write/i);
  });

  it('allows a superadmin through regardless of tree membership', async () => {
    const admin = await createUser('admin@example.com');
    const owner = await createUser('owner@example.com');
    const treeId = await createTree(owner);

    const res = await request(buildApp('write'))
      .get(`/api/trees/${treeId}`)
      .set('x-user-id', String(admin))
      .set('x-admin-role', 'super_admin');

    expect(res.status).toBe(200);
  });

  it('lets an owner write and a viewer only read', async () => {
    const owner = await createUser('owner@example.com');
    const viewer = await createUser('viewer@example.com');
    const treeId = await createTree(owner);
    await query("INSERT INTO tree_permissions (tree_id, user_id, role) VALUES ($1, $2, 'viewer')", [treeId, viewer]);

    const ownerWrite = await request(buildApp('write')).get(`/api/trees/${treeId}`).set('x-user-id', String(owner));
    expect(ownerWrite.status).toBe(200);

    const viewerRead = await request(buildApp('read')).get(`/api/trees/${treeId}`).set('x-user-id', String(viewer));
    expect(viewerRead.status).toBe(200);

    const viewerWrite = await request(buildApp('write')).get(`/api/trees/${treeId}`).set('x-user-id', String(viewer));
    expect(viewerWrite.status).toBe(403);
  });

  it('denies a non-member with no override', async () => {
    const owner = await createUser('owner@example.com');
    const stranger = await createUser('stranger@example.com');
    const treeId = await createTree(owner);

    const res = await request(buildApp('read')).get(`/api/trees/${treeId}`).set('x-user-id', String(stranger));
    expect(res.status).toBe(403);
    expect(res.body.error).toBeTruthy();
  });

  it('grants write access via a read_write override on the specific event, not the whole tree', async () => {
    const owner = await createUser('owner@example.com');
    const grantee = await createUser('grantee@example.com');
    const treeId = await createTree(owner);
    const eventId = await createEvent(treeId, owner);

    await grantOverride({
      userId: grantee,
      targetType: 'timeline_event',
      targetId: eventId,
      permissionLevel: 'read_write',
      grantedBy: owner,
    });

    const eventWrite = await request(buildApp('write'))
      .get(`/api/trees/${treeId}/events/${eventId}`)
      .set('x-user-id', String(grantee));
    expect(eventWrite.status).toBe(200);
    expect(eventWrite.body.override.target_type).toBe('timeline_event');

    const treeWrite = await request(buildApp('write')).get(`/api/trees/${treeId}`).set('x-user-id', String(grantee));
    expect(treeWrite.status).toBe(403);
  });

  it('rejects a read_only override for a write request', async () => {
    const owner = await createUser('owner@example.com');
    const grantee = await createUser('grantee@example.com');
    const treeId = await createTree(owner);

    await grantOverride({
      userId: grantee,
      targetType: 'tree',
      targetId: treeId,
      permissionLevel: 'read_only',
      grantedBy: owner,
    });

    const read = await request(buildApp('read')).get(`/api/trees/${treeId}`).set('x-user-id', String(grantee));
    expect(read.status).toBe(200);

    const write = await request(buildApp('write')).get(`/api/trees/${treeId}`).set('x-user-id', String(grantee));
    expect(write.status).toBe(403);
  });

  it('ignores an expired override', async () => {
    const owner = await createUser('owner@example.com');
    const grantee = await createUser('grantee@example.com');
    const treeId = await createTree(owner);

    await grantOverride({
      userId: grantee,
      targetType: 'tree',
      targetId: treeId,
      permissionLevel: 'read_write',
      grantedBy: owner,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await request(buildApp('read')).get(`/api/trees/${treeId}`).set('x-user-id', String(grantee));
    expect(res.status).toBe(403);
  });
});
