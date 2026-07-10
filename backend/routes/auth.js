import express from 'express';

import { findUserById } from '../models/userModel.js';
import { autoGrantEmailVisibility } from '../models/emailMatchModel.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

// Called once per browser session right after login (see loadSession() in
// frontend/main.js) to auto-grant 'viewer' access to any tree with
// email_auto_visibility enabled whose family_data contains a person-node
// matching this user's email. Deliberately not inside requireAuth itself
// (which fires on every authenticated request) - this is an explicit,
// idempotent, opt-in-per-call endpoint so the JSONB scan happens at most
// once per login, not on every request.
authRouter.post('/discovery-check', requireAuth, async (req, res, next) => {
  try {
    const grantedTreeIds = await autoGrantEmailVisibility(req.user.id, req.user.email);
    return res.json({ ok: true, grantedTreeIds });
  } catch (error) {
    return next(error);
  }
});
