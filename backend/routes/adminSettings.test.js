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

async function asAdmin() {
  return asUser('admin-sub', 'admin@example.com');
}

async function asSupportAdmin() {
  const auth = await asUser('support-admin-sub', 'support-admin@example.com');
  await query("UPDATE users SET is_admin = true, admin_role = 'support_admin' WHERE email = $1", [
    'support-admin@example.com',
  ]);
  return auth;
}

beforeEach(async () => {
  await resetDb();
});

describe('admin authorization', () => {
  it('rejects non-admin users', async () => {
    const user = await asUser('user-a', 'a@example.com');
    expect((await request(app).get('/api/admin/settings').set('Authorization', user)).status).toBe(403);
    expect(
      (await request(app).put('/api/admin/settings').set('Authorization', user).send({ maintenanceMode: true })).status
    ).toBe(403);
  });

  it('rejects support_admin on write', async () => {
    const supportAdmin = await asSupportAdmin();
    const res = await request(app).put('/api/admin/settings').set('Authorization', supportAdmin).send({ maintenanceMode: true });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/settings', () => {
  it('returns schema and default values', async () => {
    const admin = await asAdmin();
    const res = await request(app).get('/api/admin/settings').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.values.registrationEnabled).toBe(true);
    expect(res.body.schema.maintenanceMode.type).toBe('boolean');
  });
});

describe('PUT /api/admin/settings', () => {
  it('persists updates and rejects unknown keys', async () => {
    const admin = await asAdmin();

    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', admin)
      .send({ maintenanceMode: true, maxUploadSizeMb: 25 });
    expect(res.status).toBe(200);
    expect(res.body.values.maintenanceMode).toBe(true);
    expect(res.body.values.maxUploadSizeMb).toBe(25);

    const invalid = await request(app).put('/api/admin/settings').set('Authorization', admin).send({ notAKey: true });
    expect(invalid.status).toBe(400);
  });

  it('records an audit log entry', async () => {
    const admin = await asAdmin();
    await request(app).put('/api/admin/settings').set('Authorization', admin).send({ maintenanceMode: true });

    const { rows: logs } = await query("SELECT * FROM audit_logs WHERE action = 'settings.changed'");
    expect(logs).toHaveLength(1);
  });
});
