import express from 'express';

import { isValidEmail, isValidOtp } from '../utils/validation.js';
import { generateOtp, hashOtp, verifyOtp } from '../services/otpService.js';
import { sendOtpEmail } from '../services/email/otpEmail.js';
import {
  invalidatePendingOtpRequests,
  createOtpRequest,
  getPendingOtpRequest,
  incrementAttemptCount,
  markConsumed,
  isExpired,
} from '../models/otpModel.js';
import { findOrCreateUserByEmail, findUserById, updateLastLogin } from '../models/userModel.js';
import {
  createRefreshToken,
  findValidRefreshToken,
  deleteRefreshTokenByHash,
} from '../models/refreshTokenModel.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from '../utils/jwt.js';
import { requireAuth, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../middleware/auth.js';
import { otpRequestLimiter, otpVerifyLimiter } from '../middleware/rateLimit.js';

export const authRouter = express.Router();

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

const baseCookieOptions = {
  httpOnly: true,
  sameSite: process.env.COOKIE_SAMESITE || 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
};

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, { ...baseCookieOptions, path: '/', maxAge: ACCESS_TOKEN_TTL_MS });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...baseCookieOptions,
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseCookieOptions, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...baseCookieOptions, path: '/api/auth' });
}

function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  createRefreshToken(user.id, hashToken(refreshToken), Math.floor(REFRESH_TOKEN_TTL_MS / 1000));
  setAuthCookies(res, accessToken, refreshToken);
}

authRouter.post('/request-otp', otpRequestLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const normalizedEmail = email.toLowerCase();
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    invalidatePendingOtpRequests(normalizedEmail);
    createOtpRequest(normalizedEmail, otpHash, OTP_EXPIRY_MINUTES);
    await sendOtpEmail(normalizedEmail, otp, OTP_EXPIRY_MINUTES);

    return res.json({ ok: true, message: 'If this email is valid, a verification code has been sent.' });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/verify-otp', otpVerifyLimiter, async (req, res, next) => {
  try {
    const { email, otp } = req.body || {};
    if (!isValidEmail(email) || !isValidOtp(otp)) {
      return res.status(400).json({ error: 'Invalid email or verification code' });
    }

    const normalizedEmail = email.toLowerCase();
    const otpRequest = getPendingOtpRequest(normalizedEmail);
    if (!otpRequest) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    if (otpRequest.attempt_count >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
    }

    if (isExpired(otpRequest)) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    const isMatch = await verifyOtp(otp, otpRequest.otp_hash);
    if (!isMatch) {
      incrementAttemptCount(otpRequest.id);
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    markConsumed(otpRequest.id);

    const user = findOrCreateUserByEmail(normalizedEmail);
    updateLastLogin(user.id);
    const freshUser = findUserById(user.id);

    issueSession(res, freshUser);

    return res.json({ user: freshUser });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/refresh', (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) return res.status(401).json({ error: 'Not authenticated' });

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (_error) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const tokenHash = hashToken(refreshToken);
    const storedToken = findValidRefreshToken(tokenHash);
    if (!storedToken) return res.status(401).json({ error: 'Not authenticated' });

    deleteRefreshTokenByHash(tokenHash);

    const user = findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    issueSession(res, user);
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/logout', (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (refreshToken) deleteRefreshTokenByHash(hashToken(refreshToken));
    clearAuthCookies(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

authRouter.get('/me', requireAuth, (req, res, next) => {
  try {
    const user = findUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});
