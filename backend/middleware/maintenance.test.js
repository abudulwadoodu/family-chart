import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

import { setBaseTestEnv, resetDb } from '../test/testEnv.js';

setBaseTestEnv();
process.env.MAINTENANCE_BYPASS_KEY = 'dev-secret';

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

async function asAdmin() {
  return asUser('admin-sub', 'admin@example.com');
}

async function enableMaintenance() {
  const admin = await asAdmin();
  await request(app).patch('/api/admin/maintenance').set('Authorization', admin).send({ maintenanceMode: true });
}

beforeEach(async () => {
  await resetDb();
});

describe('maintenance mode off (default)', () => {
  it('lets ordinary routes through', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('maintenance mode on', () => {
  it('blocks an unauthenticated route with 503 and the maintenance payload', async () => {
    await enableMaintenance();

    const res = await request(app).get('/api/trees');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'maintenance',
      message: 'System is under maintenance. Please check back shortly.',
    });
  });

  it('still allows /api/auth/* through', async () => {
    await enableMaintenance();

    const res = await request(app).get('/api/auth/me').set('Authorization', authHeader('some-user', 'u@example.com'));
    expect(res.status).toBe(200);
  });

  it('still allows /api/admin/* through so admins can log in and flip the flag back off', async () => {
    const admin = await asAdmin();
    await enableMaintenance();

    const res = await request(app).get('/api/admin/maintenance').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.maintenanceMode).toBe(true);
  });

  it('rejects a request with no bypass key', async () => {
    await enableMaintenance();
    const res = await request(app).get('/api/trees').query({ bypass_key: 'wrong-key' });
    expect(res.status).toBe(503);
  });

  it('lets a request with a valid bypass query param through and sets a cookie', async () => {
    await enableMaintenance();

    const res = await request(app).get('/api/trees').query({ bypass_key: 'dev-secret' });
    expect(res.status).not.toBe(503);
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('maintenance_bypass=dev-secret'))).toBe(true);
  });

  it('lets a request with a valid bypass header through', async () => {
    await enableMaintenance();

    const res = await request(app).get('/api/trees').set('X-Bypass-Key', 'dev-secret');
    expect(res.status).not.toBe(503);
  });

  it('lets a request with the bypass cookie through on a later request', async () => {
    await enableMaintenance();

    const res = await request(app).get('/api/trees').set('Cookie', 'maintenance_bypass=dev-secret');
    expect(res.status).not.toBe(503);
  });

  it('sets the bypass cookie even on an exempt route, so hitting /api/auth first still works', async () => {
    await enableMaintenance();

    // /api/auth/me is exempt from the guard outright, so its own response
    // says nothing about the bypass key - the only thing under test is
    // whether the cookie got set for later, non-exempt requests to use.
    const authRes = await request(app).get('/api/auth/me').query({ bypass_key: 'dev-secret' });
    expect(authRes.headers['set-cookie']?.some((c) => c.startsWith('maintenance_bypass=dev-secret'))).toBe(true);

    const cookie = authRes.headers['set-cookie'].find((c) => c.startsWith('maintenance_bypass='));
    const treesRes = await request(app).get('/api/trees').set('Cookie', cookie);
    expect(treesRes.status).not.toBe(503);
  });
});

describe('PATCH /api/admin/maintenance', () => {
  it('rejects non-admins', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const res = await request(app).patch('/api/admin/maintenance').set('Authorization', user).send({ maintenanceMode: true });
    expect(res.status).toBe(403);
  });

  it('rejects a non-boolean payload', async () => {
    const admin = await asAdmin();
    const res = await request(app).patch('/api/admin/maintenance').set('Authorization', admin).send({ maintenanceMode: 'yes' });
    expect(res.status).toBe(400);
  });

  it('toggles maintenance mode and records an audit log entry', async () => {
    const admin = await asAdmin();

    const res = await request(app).patch('/api/admin/maintenance').set('Authorization', admin).send({ maintenanceMode: true });
    expect(res.status).toBe(200);
    expect(res.body.maintenanceMode).toBe(true);

    const { rows: logs } = await query("SELECT * FROM audit_logs WHERE action = 'settings.changed'");
    expect(logs).toHaveLength(1);
  });
});
