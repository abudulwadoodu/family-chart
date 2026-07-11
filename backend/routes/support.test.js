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

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
  SendRawEmailCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

const { app } = await import('../app.js');
const { query } = await import('../db/index.js');
const { resetRateLimits } = await import('../middleware/rateLimit.js');

function authHeader(sub, email) {
  return `Bearer ${sub}::${email}`;
}

async function asUser(sub, email) {
  await request(app).get('/api/auth/me').set('Authorization', authHeader(sub, email));
  return authHeader(sub, email);
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

beforeEach(async () => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
  await resetDb();
  resetRateLimits();
});

describe('POST /api/support/tickets', () => {
  it('requires authentication', async () => {
    const res = await createTicket('Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('creates a ticket with a first message and sends a confirmation email', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await createTicket(user);

    expect(res.status).toBe(201);
    expect(res.body.ticket.ticket_number).toMatch(/^TCK-\d{6}$/);
    expect(res.body.ticket.status).toBe('NEW');
    // confirmation to the user + notice to the support inbox
    expect(sendMock).toHaveBeenCalledTimes(2);

    const { rows: messages } = await query('SELECT * FROM support_messages WHERE ticket_id = $1', [res.body.ticket.id]);
    expect(messages).toHaveLength(1);
    expect(messages[0].sender_type).toBe('USER');
  });

  it('still creates the ticket even if the confirmation email fails', async () => {
    sendMock.mockRejectedValueOnce(new Error('SES is down'));
    const user = await asUser('user-sub', 'user@example.com');
    const res = await createTicket(user);

    expect(res.status).toBe(201);
    expect(res.body.ticket).toBeDefined();
  });

  it('accepts and stores an attachment', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await createTicket(user).attach('file', Buffer.from('hello world'), {
      filename: 'note.txt',
      contentType: 'text/plain',
    });

    expect(res.status).toBe(201);
    const { rows } = await query('SELECT * FROM support_messages WHERE ticket_id = $1', [res.body.ticket.id]);
    expect(rows[0].attachment_filename).toBe('note.txt');
  });

  it('rejects disallowed attachment types', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await createTicket(user).attach('file', Buffer.from('#!/bin/sh'), {
      filename: 'script.sh',
      contentType: 'application/x-sh',
    });
    expect(res.status).toBe(400);
  });

  it('requires a subject', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await createTicket(user, { subject: 'hi' });
    expect(res.status).toBe(400);
  });

  it('requires a recognized category', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await createTicket(user, { category: 'Not A Category' });
    expect(res.status).toBe(400);
  });

  it('enforces a minimum message length', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await createTicket(user, { message: 'too short' });
    expect(res.status).toBe(400);
  });

  it('silently no-ops when the honeypot field is filled in', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await createTicket(user, { website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(sendMock).not.toHaveBeenCalled();
    const { rows } = await query('SELECT COUNT(*) AS c FROM support_tickets');
    expect(Number(rows[0].c)).toBe(0);
  });

  it('rate limits repeated ticket creation from the same user', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    for (let i = 0; i < 5; i += 1) {
      const res = await createTicket(user);
      expect(res.status).toBe(201);
    }
    const res = await createTicket(user);
    expect(res.status).toBe(429);
  });
});

describe('POST /api/support/public-tickets', () => {
  function submitPublicContact(overrides = {}) {
    const payload = {
      subject: 'I cannot import my CSV',
      category: 'Technical Support',
      message: 'This is a sufficiently long message describing the problem in detail.',
      email: 'visitor@example.com',
      ...overrides,
    };
    let req = request(app).post('/api/support/public-tickets');
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined) req = req.field(key, value);
    });
    return req;
  }

  it('does not require authentication', async () => {
    const res = await submitPublicContact();
    expect(res.status).toBe(201);
  });

  it('emails the support inbox with the visitor email as Reply-To, and creates no ticket', async () => {
    const res = await submitPublicContact();

    expect(res.status).toBe(201);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [[{ input }]] = sendMock.mock.calls;
    const raw = input.RawMessage.Data.toString('utf8');
    expect(raw).toContain('Reply-To: visitor@example.com');

    const { rows } = await query('SELECT COUNT(*) AS c FROM support_tickets');
    expect(Number(rows[0].c)).toBe(0);
  });

  it('requires a valid email address', async () => {
    const res = await submitPublicContact({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('requires a subject', async () => {
    const res = await submitPublicContact({ subject: 'hi' });
    expect(res.status).toBe(400);
  });

  it('requires a recognized category', async () => {
    const res = await submitPublicContact({ category: 'Not A Category' });
    expect(res.status).toBe(400);
  });

  it('enforces a minimum message length', async () => {
    const res = await submitPublicContact({ message: 'too short' });
    expect(res.status).toBe(400);
  });

  it('silently no-ops when the honeypot field is filled in', async () => {
    const res = await submitPublicContact({ website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rate limits repeated submissions from the same IP', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await submitPublicContact();
      expect(res.status).toBe(201);
    }
    const res = await submitPublicContact();
    expect(res.status).toBe(429);
  });
});

describe('GET /api/support/tickets', () => {
  it('only lists the requesting user’s own tickets', async () => {
    const userA = await asUser('user-a', 'a@example.com');
    const userB = await asUser('user-b', 'b@example.com');
    await createTicket(userA);
    await createTicket(userB);

    const res = await request(app).get('/api/support/tickets').set('Authorization', userA);
    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });
});

describe('GET /api/support/tickets/:id', () => {
  it('returns 404 for a ticket owned by another user', async () => {
    const userA = await asUser('user-a', 'a@example.com');
    const userB = await asUser('user-b', 'b@example.com');
    const created = await createTicket(userA);

    const res = await request(app).get(`/api/support/tickets/${created.body.ticket.id}`).set('Authorization', userB);
    expect(res.status).toBe(404);
  });

  it('returns the ticket and its messages for the owner', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);

    const res = await request(app).get(`/api/support/tickets/${created.body.ticket.id}`).set('Authorization', user);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });
});

describe('POST /api/support/tickets/:id/messages', () => {
  it('rejects replies from a user who does not own the ticket', async () => {
    const userA = await asUser('user-a', 'a@example.com');
    const userB = await asUser('user-b', 'b@example.com');
    const created = await createTicket(userA);

    const res = await request(app)
      .post(`/api/support/tickets/${created.body.ticket.id}/messages`)
      .set('Authorization', userB)
      .field('message', 'Sneaky reply');
    expect(res.status).toBe(404);
  });

  it('moves the ticket to IN_PROGRESS on a user reply', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);

    const res = await request(app)
      .post(`/api/support/tickets/${created.body.ticket.id}/messages`)
      .set('Authorization', user)
      .field('message', 'Following up on this.');

    expect(res.status).toBe(201);
    expect(res.body.ticket.status).toBe('IN_PROGRESS');
  });

  it('blocks replies on a closed ticket', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user);
    await query("UPDATE support_tickets SET status = 'CLOSED' WHERE id = $1", [created.body.ticket.id]);

    const res = await request(app)
      .post(`/api/support/tickets/${created.body.ticket.id}/messages`)
      .set('Authorization', user)
      .field('message', 'Reopening?');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/support/messages/:messageId/attachment', () => {
  it('streams the attachment for the ticket owner', async () => {
    const user = await asUser('user-a', 'a@example.com');
    const created = await createTicket(user).attach('file', Buffer.from('attachment bytes'), {
      filename: 'note.txt',
      contentType: 'text/plain',
    });
    const { rows: messageRows } = await query('SELECT id FROM support_messages WHERE ticket_id = $1', [
      created.body.ticket.id,
    ]);
    const message = messageRows[0];

    const res = await request(app).get(`/api/support/messages/${message.id}/attachment`).set('Authorization', user);
    expect(res.status).toBe(200);
    expect(res.text).toBe('attachment bytes');
  });

  it('denies access to another user’s attachment', async () => {
    const userA = await asUser('user-a', 'a@example.com');
    const userB = await asUser('user-b', 'b@example.com');
    const created = await createTicket(userA).attach('file', Buffer.from('secret'), {
      filename: 'note.txt',
      contentType: 'text/plain',
    });
    const { rows: messageRows } = await query('SELECT id FROM support_messages WHERE ticket_id = $1', [
      created.body.ticket.id,
    ]);
    const message = messageRows[0];

    const res = await request(app).get(`/api/support/messages/${message.id}/attachment`).set('Authorization', userB);
    expect(res.status).toBe(404);
  });
});
