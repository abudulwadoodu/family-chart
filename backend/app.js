import express from 'express';
import cors from 'cors';

import { initDb } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { treesRouter } from './routes/trees.js';
import { accountRouter } from './routes/account.js';
import { supportRouter } from './routes/support.js';
import { adminSupportRouter } from './routes/adminSupport.js';

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
app.use('/api/account', accountRouter);
app.use('/api/support', supportRouter);
app.use('/api/admin/support', adminSupportRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
