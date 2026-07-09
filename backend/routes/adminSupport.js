import express from 'express';
import multer from 'multer';

import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { findUserById } from '../models/userModel.js';
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  getTicketById,
  listTicketsForAdmin,
  updateTicketStatus,
  updateTicketFields,
} from '../models/ticketModel.js';
import { createMessage, listMessagesForTicket, getMessageAttachment } from '../models/messageModel.js';
import { onAdminReply } from '../services/ticketWorkflow.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/auditLog.js';
import { sendAdminReplyEmail, sendTicketResolvedEmail, sendTicketClosedEmail } from '../utils/supportEmail.js';
import {
  SUPPORT_CATEGORIES,
  REPLY_MIN_LENGTH,
  REPLY_MAX_LENGTH,
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
  validateMessageLength,
} from '../utils/supportValidation.js';

export const adminSupportRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } });

adminSupportRouter.use(requireAuth, requireAdmin);

function parseUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Attachment must be 10 MB or smaller' });
    return res.status(400).json({ error: 'Could not process the uploaded file' });
  });
}

function isTruthy(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

adminSupportRouter.get('/tickets', async (req, res, next) => {
  try {
    const { search, status, priority, assignedTo, sort, order, page, pageSize } = req.query;
    const result = await listTicketsForAdmin({ search, status, priority, assignedTo, sort, order, page, pageSize });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

adminSupportRouter.get('/tickets/:id', async (req, res, next) => {
  try {
    const ticket = await getTicketById(Number(req.params.id));
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const owner = await findUserById(ticket.user_id);
    const messages = await listMessagesForTicket(ticket.id, { includeInternal: true });
    return res.json({ ticket, owner: owner ? { id: owner.id, email: owner.email } : null, messages });
  } catch (error) {
    return next(error);
  }
});

adminSupportRouter.post('/tickets/:id/messages', parseUpload, async (req, res, next) => {
  try {
    const ticket = await getTicketById(Number(req.params.id));
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const isInternal = isTruthy(req.body?.isInternal);

    const { error: messageError, trimmed: trimmedMessage } = validateMessageLength(req.body?.message, {
      min: REPLY_MIN_LENGTH,
      max: REPLY_MAX_LENGTH,
    });
    if (messageError) return res.status(400).json({ error: messageError });

    const attachmentError = validateAttachment(req.file);
    if (attachmentError) return res.status(400).json({ error: attachmentError });

    const savedMessage = await createMessage({
      ticketId: ticket.id,
      senderType: 'ADMIN',
      senderId: req.user.id,
      message: trimmedMessage,
      isInternal,
      file: req.file,
    });
    const updatedTicket = await onAdminReply(ticket, { isInternal });

    if (!isInternal) {
      try {
        const owner = await findUserById(updatedTicket.user_id);
        if (owner) {
          await sendAdminReplyEmail({ ticket: updatedTicket, userEmail: owner.email, message: trimmedMessage, attachment: req.file });
        }
      } catch (emailError) {
        console.error(`[admin-support] reply on ticket #${ticket.id} saved but notification email failed`, emailError);
      }
    }

    return res.status(201).json({ ok: true, ticket: updatedTicket, message: savedMessage });
  } catch (error) {
    return next(error);
  }
});

adminSupportRouter.patch('/tickets/:id', async (req, res, next) => {
  try {
    let ticket = await getTicketById(Number(req.params.id));
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { status, priority, category, assignedTo } = req.body || {};

    if (status !== undefined && !TICKET_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (priority !== undefined && !TICKET_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }
    if (category !== undefined && !SUPPORT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    let normalizedAssignedTo;
    if (assignedTo !== undefined) {
      if (assignedTo === null) {
        normalizedAssignedTo = null;
      } else {
        const assignee = await findUserById(Number(assignedTo));
        if (!assignee?.is_admin) return res.status(400).json({ error: 'Tickets can only be assigned to admins' });
        normalizedAssignedTo = assignee.id;
      }
    }

    if (priority !== undefined || category !== undefined || normalizedAssignedTo !== undefined) {
      ticket = await updateTicketFields(ticket.id, { priority, category, assignedTo: normalizedAssignedTo });
    }

    if (status !== undefined && status !== ticket.status) {
      ticket = await updateTicketStatus(ticket.id, status);
      try {
        const owner = await findUserById(ticket.user_id);
        if (owner && status === 'RESOLVED') await sendTicketResolvedEmail({ ticket, userEmail: owner.email });
        if (owner && status === 'CLOSED') await sendTicketClosedEmail({ ticket, userEmail: owner.email });
      } catch (emailError) {
        console.error(`[admin-support] status update on ticket #${ticket.id} saved but notification email failed`, emailError);
      }
    }

    await recordAuditLog(req, {
      action: AUDIT_ACTIONS.TICKET_UPDATED,
      targetType: 'ticket',
      targetId: ticket.id,
      details: { status, priority, category, assignedTo: normalizedAssignedTo },
    });

    return res.json({ ok: true, ticket });
  } catch (error) {
    return next(error);
  }
});

adminSupportRouter.get('/tickets/:id/messages/:messageId/attachment', async (req, res, next) => {
  try {
    const attachment = await getMessageAttachment(Number(req.params.messageId));
    if (!attachment || attachment.ticket_id !== Number(req.params.id) || !attachment.attachment_data) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.setHeader('Content-Type', attachment.attachment_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.attachment_filename || 'file')}"`);
    return res.send(attachment.attachment_data);
  } catch (error) {
    return next(error);
  }
});
