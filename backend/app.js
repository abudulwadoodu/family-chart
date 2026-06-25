import express from 'express';
import cors from 'cors';

import { initDb } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { treesRouter } from './routes/trees.js';
import { membershipsRouter } from './routes/memberships.js';

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:8080';

initDb();

export const app = express();

app.use(cors({ origin: frontendOrigin }));
app.use(express.json({ limit: '1mb' }));

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
