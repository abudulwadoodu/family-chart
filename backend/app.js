import express from 'express';
import cors from 'cors';

import { initDb } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { treesRouter } from './routes/trees.js';
import { accountRouter } from './routes/account.js';
import { vaultRouter } from './routes/vault.js';
import { supportRouter } from './routes/support.js';
import { adminSupportRouter } from './routes/adminSupport.js';
import { adminUsersRouter } from './routes/adminUsers.js';
import { adminTreesRouter } from './routes/adminTrees.js';
import { adminSettingsRouter } from './routes/adminSettings.js';
import { adminAuditLogsRouter } from './routes/adminAuditLogs.js';
import { adminDashboardRouter } from './routes/adminDashboard.js';
import { mediaRouter } from './routes/media.js';
import { albumsRouter } from './routes/albums.js';
import { eventsRouter } from './routes/events.js';
import { activityRouter } from './routes/activity.js';
import { commentsRouter, reactionsRouter } from './routes/comments.js';

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:8080';

await initDb();

export const app = express();

app.use(cors({ origin: frontendOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/trees', treesRouter);
app.use('/api/account', accountRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/support', supportRouter);
app.use('/api/admin/support', adminSupportRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/trees', adminTreesRouter);
app.use('/api/admin/settings', adminSettingsRouter);
app.use('/api/admin/audit-logs', adminAuditLogsRouter);
app.use('/api/admin/dashboard', adminDashboardRouter);
app.use('/api/trees/:treeId/media', mediaRouter);
app.use('/api/trees/:treeId/albums', albumsRouter);
app.use('/api/trees/:treeId/events', eventsRouter);
app.use('/api/trees/:treeId/activity', activityRouter);
app.use('/api/trees/:treeId/comments', commentsRouter);
app.use('/api/trees/:treeId/reactions', reactionsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
