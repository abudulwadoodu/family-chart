import express from 'express';
import bcrypt from 'bcrypt';

import { getDb } from '../db/index.js';
import { isValidEmail, isValidPassword } from '../utils/validation.js';

export const authRouter = express.Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({ error: 'Invalid email or password format' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = db
      .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(email.toLowerCase(), passwordHash);

    req.session.userId = result.lastInsertRowid;
    return res.status(201).json({ id: result.lastInsertRowid, email: email.toLowerCase() });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const db = getDb();
    const user = db
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .get(email.toLowerCase());

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId = user.id;
    return res.json({ id: user.id, email: user.email });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('family_chart.sid');
    return res.json({ ok: true });
  });
});

authRouter.get('/me', (req, res, next) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const db = getDb();
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});
