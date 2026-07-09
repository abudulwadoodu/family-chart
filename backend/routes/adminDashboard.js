import express from 'express';

import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { countAllUsers, countActiveUsersSince, countUsersCreatedSince } from '../models/userModel.js';
import { TICKET_STATUSES, listTicketsForAdmin } from '../models/ticketModel.js';
import { listRecentAuditLogs } from '../models/auditLogModel.js';

export const adminDashboardRouter = express.Router();

adminDashboardRouter.use(requireAuth, requireAdmin);

adminDashboardRouter.get('/stats', async (_req, res, next) => {
  try {
    const totalUsers = await countAllUsers();
    const activeToday = await countActiveUsersSince(1);
    const activeLast30Days = await countActiveUsersSince(30);
    const newRegistrations = await countUsersCreatedSince(7);

    const totalTreesResult = await query('SELECT COUNT(*) AS c FROM trees');
    const totalTrees = Number(totalTreesResult.rows[0].c);

    const totalMembersResult = await query('SELECT COALESCE(SUM(jsonb_array_length(json_data)), 0) AS c FROM family_data');
    const totalMembers = Number(totalMembersResult.rows[0].c) || 0;

    const treeStorageResult = await query('SELECT COALESCE(SUM(LENGTH(json_data::text)), 0) AS bytes FROM family_data');
    const treeStorageBytes = Number(treeStorageResult.rows[0].bytes) || 0;
    const attachmentResult = await query('SELECT COALESCE(SUM(attachment_size), 0) AS bytes FROM support_messages');
    const attachmentBytes = Number(attachmentResult.rows[0].bytes) || 0;
    const storageBytes = treeStorageBytes + attachmentBytes;

    const ticketCounts = {};
    await Promise.all(
      TICKET_STATUSES.map(async (status) => {
        const result = await listTicketsForAdmin({ status, page: 1, pageSize: 1 });
        ticketCounts[status] = result.total;
      })
    );
    const openTickets = TICKET_STATUSES.filter((s) => s !== 'CLOSED').reduce((sum, s) => sum + (ticketCounts[s] || 0), 0);
    const closedTickets = ticketCounts.CLOSED || 0;

    const recentActivity = await listRecentAuditLogs(10);

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
