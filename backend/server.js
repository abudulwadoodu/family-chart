import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import cors from 'cors';

import { initDb } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { treesRouter } from './routes/trees.js';
import { membershipsRouter } from './routes/memberships.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:8080';
const sessionSecret = process.env.SESSION_SECRET || 'dev-only-change-me';

initDb();

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// MemoryStore keeps setup simple for local-first development.
app.use(
  session({
    name: 'family_chart.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: process.env.COOKIE_SAMESITE || 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: Number(process.env.SESSION_MAX_AGE_MS || 1000 * 60 * 60 * 24 * 7),
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/trees', treesRouter);
app.use('/api', membershipsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
