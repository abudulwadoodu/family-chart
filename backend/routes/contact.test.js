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

function submit(auth, overrides = {}) {
  const payload = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    subject: 'Bug Report',
    message: 'This is a sufficiently long message describing the bug in detail.',
    ...overrides,
  };
  let req = request(app).post('/api/contact').set('Authorization', auth);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) req = req.field(key, value);
  });
  return req;
}

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
  const db = getDb();
  db.exec('DELETE FROM contact_submissions');
  db.exec('DELETE FROM tree_permissions');
  db.exec('DELETE FROM family_data');
  db.exec('DELETE FROM trees');
  db.exec('DELETE FROM users');
});

describe('POST /api/contact', () => {
  it('requires authentication', async () => {
    const res = await submit('Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('sends a contact email and stores the submission as sent', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user);

    expect(res.status).toBe(201);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const row = getDb().prepare('SELECT * FROM contact_submissions WHERE id = ?').get(res.body.id);
    expect(row.status).toBe('sent');
    expect(row.email).toBe('jane@example.com');
  });

  it('accepts and stores an attachment', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user).attach('file', Buffer.from('hello world'), {
      filename: 'note.txt',
      contentType: 'text/plain',
    });

    expect(res.status).toBe(201);
    const row = getDb().prepare('SELECT * FROM contact_submissions WHERE id = ?').get(res.body.id);
    expect(row.attachment_filename).toBe('note.txt');
    expect(row.attachment_mimetype).toBe('text/plain');
    expect(row.attachment_data.toString()).toBe('hello world');
  });

  it('rejects disallowed attachment types', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user).attach('file', Buffer.from('#!/bin/sh\necho hi'), {
      filename: 'script.sh',
      contentType: 'application/x-sh',
    });

    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects oversized attachments', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    const res = await submit(user).attach('file', big, { filename: 'big.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('requires a name', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user, { name: '' });
    expect(res.status).toBe(400);
  });

  it('requires a valid email address', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user, { email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('requires a recognized subject', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user, { subject: 'Not A Real Subject' });
    expect(res.status).toBe(400);
  });

  it('enforces a minimum message length', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user, { message: 'too short' });
    expect(res.status).toBe(400);
  });

  it('silently no-ops when the honeypot field is filled in', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user, { website: 'http://spam.example' });

    expect(res.status).toBe(201);
    expect(sendMock).not.toHaveBeenCalled();
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM contact_submissions').get().c;
    expect(count).toBe(0);
  });

  it('stores the submission as failed and returns 502 when SES errors out', async () => {
    sendMock.mockRejectedValueOnce(new Error('SES is down'));
    const user = await asUser('user-sub', 'user@example.com');
    const res = await submit(user);

    expect(res.status).toBe(502);
    const row = getDb().prepare('SELECT * FROM contact_submissions ORDER BY id DESC LIMIT 1').get();
    expect(row.status).toBe('failed');
    expect(row.error).toContain('SES is down');
  });

  it('rate limits repeated submissions from the same user', async () => {
    const user = await asUser('user-sub', 'user@example.com');
    for (let i = 0; i < 5; i += 1) {
      const res = await submit(user);
      expect(res.status).toBe(201);
    }
    const res = await submit(user);
    expect(res.status).toBe(429);
  });
});
