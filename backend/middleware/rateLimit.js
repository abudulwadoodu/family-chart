import rateLimit from 'express-rate-limit';

export const otpRequestLimiter = rateLimit({
  windowMs: Number(process.env.OTP_REQUEST_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  limit: Number(process.env.OTP_REQUEST_RATE_LIMIT_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please try again later.' },
});

export const otpVerifyLimiter = rateLimit({
  windowMs: Number(process.env.OTP_VERIFY_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  limit: Number(process.env.OTP_VERIFY_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
});
