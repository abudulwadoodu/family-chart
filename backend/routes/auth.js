import express from 'express';

import { findUserById } from '../models/userModel.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

authRouter.get('/me', requireAuth, (req, res, next) => {
  try {
    const user = findUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});
