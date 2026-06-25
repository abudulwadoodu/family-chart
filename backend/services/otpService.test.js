import { describe, it, expect } from 'vitest';
import { generateOtp, hashOtp, verifyOtp } from './otpService.js';

describe('otpService', () => {
  it('generates a 6-digit numeric code', () => {
    for (let i = 0; i < 25; i += 1) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
    }
  });

  it('hashes the OTP rather than storing it in plain text', async () => {
    const otp = '123456';
    const hash = await hashOtp(otp);
    expect(hash).not.toBe(otp);
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifies a correct OTP against its hash', async () => {
    const otp = generateOtp();
    const hash = await hashOtp(otp);
    await expect(verifyOtp(otp, hash)).resolves.toBe(true);
  });

  it('rejects an incorrect OTP', async () => {
    const hash = await hashOtp('111111');
    await expect(verifyOtp('222222', hash)).resolves.toBe(false);
  });
});
