import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

import { setBaseTestEnv } from '../test/testEnv.js';

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
const { getDb } = await import('../db/index.js');

function authHeader(sub, email) {
  return `Bearer ${sub}::${email}`;
}

async function asUser(sub, email) {
  await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return authHeader(sub, email);
}

// admin@example.com is whitelisted via ADMIN_EMAILS in setBaseTestEnv().
async function asAdmin() {
  return asUser('admin-sub', 'admin@example.com');
}

function createTicket(auth, overrides = {}) {
  const payload = {
    subject: 'I cannot import my CSV',
    category: 'Technical Support',
    message: 'This is a sufficiently long message describing the problem in detail.',
    ...overrides,
  };
  let req = request(app).post('/api/support/tickets').set('Authorization', auth);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) req = req.field(key, value);
  });
  return req;
}

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
  const db = getDb();
  db.exec('DELETE FROM support_messages');
  db.exec('DELETE FROM support_tickets');
  db.exec('DELETE FROM tree_permissions');
  db.exec('DELETE FROM family_data');
  db.exec('DELETE FROM trees');
  db.exec('DELETE FROM users');
});

describe('admin authorization', () => {
  it('rejects non-admin users on every admin endpoint', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);
    const ticketId = created.body.ticket.id;

    expect((await request(app).get('/api/admin/support/tickets').set('Authorization', user)).status).toBe(403);
    expect((await request(app).get(`/api/admin/support/tickets/${ticketId}`).set('Authorization', user)).status).toBe(403);
    expect(
      (await request(app).patch(`/api/admin/support/tickets/${ticketId}`).set('Authorization', user).send({ status: 'RESOLVED' }))
        .status
    ).toBe(403);
  });
});

describe('GET /api/admin/support/tickets', () => {
  it('lists tickets across all users', async () => {
    const userA = await asUser('user-a', 'a@example.com');
    const userB = await asUser('user-b', 'b@example.com');
    await createTicket(userA);
    await createTicket(userB);
    const admin = await asAdmin();

    const res = await request(app).get('/api/admin/support/tickets').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });
});

describe('admin replies', () => {
  it('sets WAITING_FOR_USER and emails the user on a customer-facing reply', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);
    const admin = await asAdmin();
    sendMock.mockClear();

    const res = await request(app)
      .post(`/api/admin/support/tickets/${created.body.ticket.id}/messages`)
      .set('Authorization', admin)
      .field('message', 'Can you upload the CSV file?');

    expect(res.status).toBe(201);
    expect(res.body.ticket.status).toBe('WAITING_FOR_USER');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('keeps internal notes out of the customer-facing status and conversation, and does not email the user', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);
    const admin = await asAdmin();
    sendMock.mockClear();

    const res = await request(app)
      .post(`/api/admin/support/tickets/${created.body.ticket.id}/messages`)
      .set('Authorization', admin)
      .field('message', 'Looks like a parser bug, investigating.')
      .field('isInternal', 'true');

    expect(res.status).toBe(201);
    expect(res.body.ticket.status).toBe('NEW');
    expect(sendMock).not.toHaveBeenCalled();

    const userView = await request(app).get(`/api/support/tickets/${created.body.ticket.id}`).set('Authorization', user);
    expect(userView.body.messages).toHaveLength(1);

    const adminView = await request(app).get(`/api/admin/support/tickets/${created.body.ticket.id}`).set('Authorization', admin);
    expect(adminView.body.messages).toHaveLength(2);
  });
});

describe('PATCH /api/admin/support/tickets/:id', () => {
  it('marks a ticket resolved and emails the user', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);
    const admin = await asAdmin();
    sendMock.mockClear();

    const res = await request(app)
      .patch(`/api/admin/support/tickets/${created.body.ticket.id}`)
      .set('Authorization', admin)
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('RESOLVED');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('sets closed_at when closed and emails the user', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);
    const admin = await asAdmin();

    const res = await request(app)
      .patch(`/api/admin/support/tickets/${created.body.ticket.id}`)
      .set('Authorization', admin)
      .send({ status: 'CLOSED' });

    expect(res.status).toBe(200);
    expect(res.body.ticket.closed_at).not.toBeNull();
  });

  it('only allows assigning tickets to admin users', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);
    const admin = await asAdmin();
    const userRow = getDb().prepare('SELECT id FROM users WHERE email = ?').get('a@example.com');

    const res = await request(app)
      .patch(`/api/admin/support/tickets/${created.body.ticket.id}`)
      .set('Authorization', admin)
      .send({ assignedTo: userRow.id });
    expect(res.status).toBe(400);

    const adminRow = getDb().prepare('SELECT id FROM users WHERE email = ?').get('admin@example.com');
    const res2 = await request(app)
      .patch(`/api/admin/support/tickets/${created.body.ticket.id}`)
      .set('Authorization', admin)
      .send({ assignedTo: adminRow.id });
    expect(res2.status).toBe(200);
    expect(res2.body.ticket.assigned_to).toBe(adminRow.id);
  });
});

describe('GET /api/admin/support/tickets/:id/messages/:messageId/attachment', () => {
  it('lets an admin download an internal note attachment', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);
    const admin = await asAdmin();

    await request(app)
      .post(`/api/admin/support/tickets/${created.body.ticket.id}/messages`)
      .set('Authorization', admin)
      .field('message', 'Internal only')
      .field('isInternal', 'true')
      .attach('file', Buffer.from('internal attachment'), { filename: 'log.txt', contentType: 'text/plain' });

    const note = getDb()
      .prepare('SELECT id FROM support_messages WHERE ticket_id = ? AND is_internal = 1')
      .get(created.body.ticket.id);

    const res = await request(app)
      .get(`/api/admin/support/tickets/${created.body.ticket.id}/messages/${note.id}/attachment`)
      .set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.text).toBe('internal attachment');
  });
});
