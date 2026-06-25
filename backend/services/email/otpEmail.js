import { sendEmail } from './emailService.js';

export function sendOtpEmail(email, otp, expiryMinutes) {
  return sendEmail({
    to: email,
    subject: 'Your Family Chart login code',
    text: `Your verification code is ${otp}. It expires in ${expiryMinutes} minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your verification code is <strong>${otp}</strong>.</p><p>It expires in ${expiryMinutes} minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}
