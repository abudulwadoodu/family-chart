import crypto from 'crypto';
import bcrypt from 'bcrypt';

const OTP_SALT_ROUNDS = 10;

export function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function hashOtp(otp) {
  return bcrypt.hash(otp, OTP_SALT_ROUNDS);
}

export function verifyOtp(otp, otpHash) {
  return bcrypt.compare(otp, otpHash);
}
