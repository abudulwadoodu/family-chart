import { describe, it, expect } from 'vitest';
import request from 'supertest';

import { setBaseTestEnv } from '../test/testEnv.js';

setBaseTestEnv();
process.env.OTP_REQUEST_RATE_LIMIT_MAX = '2';
process.env.OTP_REQUEST_RATE_LIMIT_WINDOW_MS = '60000';
process.env.OTP_VERIFY_RATE_LIMIT_MAX = '2';
process.env.OTP_VERIFY_RATE_LIMIT_WINDOW_MS = '60000';

const { app } = await import('../app.js');

describe('OTP rate limiting', () => {
  it('blocks request-otp once the configured per-IP limit is exceeded', async () => {
    const first = await request(app).post('/api/auth/request-otp').send({ email: 'a@example.com' });
    const second = await request(app).post('/api/auth/request-otp').send({ email: 'b@example.com' });
    const third = await request(app).post('/api/auth/request-otp').send({ email: 'c@example.com' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });

  it('blocks verify-otp once the configured per-IP limit is exceeded', async () => {
    const first = await request(app).post('/api/auth/verify-otp').send({ email: 'x@example.com', otp: '000000' });
    const second = await request(app).post('/api/auth/verify-otp').send({ email: 'x@example.com', otp: '000000' });
    const third = await request(app).post('/api/auth/verify-otp').send({ email: 'x@example.com', otp: '000000' });

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
  });
});
