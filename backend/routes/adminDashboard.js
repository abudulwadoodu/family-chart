import express from 'express';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { countAllUsers, countActiveUsersSince, countUsersCreatedSince } from '../models/userModel.js';
import { TICKET_STATUSES, listTicketsForAdmin } from '../models/ticketModel.js';
import { listRecentAuditLogs } from '../models/auditLogModel.js';

export const adminDashboardRouter = express.Router();

adminDashboardRouter.use(requireAuth, requireAdmin);

adminDashboardRouter.get('/stats', async (_req, res, next) => {
  try {
    const db = getDb();

    const totalUsers = countAllUsers();
    const activeToday = countActiveUsersSince('-1 day');
    const activeLast30Days = countActiveUsersSince('-30 days');
    const newRegistrations = countUsersCreatedSince('-7 days');

    const totalTrees = db.prepare('SELECT COUNT(*) AS c FROM trees').get().c;
    const totalMembers =
      db.prepare('SELECT COALESCE(SUM(json_array_length(json_data)), 0) AS c FROM family_data').get().c || 0;

    const treeStorageBytes =
      db.prepare('SELECT COALESCE(SUM(LENGTH(json_data)), 0) AS bytes FROM family_data').get().bytes || 0;
    const attachmentBytes =
      db.prepare('SELECT COALESCE(SUM(attachment_size), 0) AS bytes FROM support_messages').get().bytes || 0;
    const storageBytes = treeStorageBytes + attachmentBytes;

    const ticketCounts = {};
    await Promise.all(
      TICKET_STATUSES.map(async (status) => {
        const result = listTicketsForAdmin({ status, page: 1, pageSize: 1 });
        ticketCounts[status] = result.total;
      })
    );
    const openTickets = TICKET_STATUSES.filter((s) => s !== 'CLOSED').reduce((sum, s) => sum + (ticketCounts[s] || 0), 0);
    const closedTickets = ticketCounts.CLOSED || 0;

    const recentActivity = listRecentAuditLogs(10);

    return res.json({
      totalUsers,
      activeToday,
      activeLast30Days,
      totalTrees,
      totalMembers,
      newRegistrations,
      openTickets,
      closedTickets,
      storageBytes,
      recentActivity,
    });
  } catch (error) {
    return next(error);
  }
});
