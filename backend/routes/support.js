import express from 'express';
import multer from 'multer';

import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { isNonEmptyString } from '../utils/validation.js';
import { findUserById } from '../models/userModel.js';
import { createTicket, getTicketForUser, listTicketsForUser } from '../models/ticketModel.js';
import { createMessage, listMessagesForTicket, getMessageAttachment } from '../models/messageModel.js';
import { onUserReply } from '../services/ticketWorkflow.js';
import { sendTicketCreatedEmail, sendUserReplyEmail } from '../utils/supportEmail.js';
import {
  SUPPORT_CATEGORIES,
  SUBJECT_MIN_LENGTH,
  SUBJECT_MAX_LENGTH,
  TICKET_MESSAGE_MIN_LENGTH,
  TICKET_MESSAGE_MAX_LENGTH,
  REPLY_MIN_LENGTH,
  REPLY_MAX_LENGTH,
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
  validateMessageLength,
} from '../utils/supportValidation.js';

export { SUPPORT_CATEGORIES };

export const supportRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } });

supportRouter.use(requireAuth);

function parseUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Attachment must be 10 MB or smaller' });
    return res.status(400).json({ error: 'Could not process the uploaded file' });
  });
}

supportRouter.post('/tickets', rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }), parseUpload, async (req, res, next) => {
  try {
    const { subject, category, message, website } = req.body || {};

    // Honeypot: a filled-in hidden field means a bot submitted the form.
    if (website) return res.status(201).json({ ok: true });

    const trimmedSubject = typeof subject === 'string' ? subject.trim() : '';
    if (!isNonEmptyString(subject, SUBJECT_MAX_LENGTH) || trimmedSubject.length < SUBJECT_MIN_LENGTH) {
      return res
        .status(400)
        .json({ error: `Subject must be between ${SUBJECT_MIN_LENGTH} and ${SUBJECT_MAX_LENGTH} characters` });
    }
    if (!SUPPORT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Please choose a valid category' });
    }
    const { error: messageError, trimmed: trimmedMessage } = validateMessageLength(message, {
      min: TICKET_MESSAGE_MIN_LENGTH,
      max: TICKET_MESSAGE_MAX_LENGTH,
    });
    if (messageError) return res.status(400).json({ error: messageError });

    const attachmentError = validateAttachment(req.file);
    if (attachmentError) return res.status(400).json({ error: attachmentError });

    const ticket = await createTicket({ userId: req.user.id, subject: trimmedSubject, category });
    await createMessage({ ticketId: ticket.id, senderType: 'USER', senderId: req.user.id, message: trimmedMessage, file: req.file });

    try {
      await sendTicketCreatedEmail({ ticket, userEmail: req.user.email, message: trimmedMessage, attachment: req.file });
    } catch (emailError) {
      console.error(`[support] ticket #${ticket.id} created but confirmation email failed`, emailError);
    }

    return res.status(201).json({ ok: true, ticket });
  } catch (error) {
    return next(error);
  }
});

supportRouter.get('/tickets', async (req, res, next) => {
  try {
    const { search, status, priority, sort, order, page, pageSize } = req.query;
    const result = await listTicketsForUser({ userId: req.user.id, search, status, priority, sort, order, page, pageSize });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

supportRouter.get('/tickets/:id', async (req, res, next) => {
  try {
    const ticket = await getTicketForUser(Number(req.params.id), req.user.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const messages = await listMessagesForTicket(ticket.id, { includeInternal: false });
    return res.json({ ticket, messages });
  } catch (error) {
    return next(error);
  }
});

supportRouter.post(
  '/tickets/:id/messages',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }),
  parseUpload,
  async (req, res, next) => {
    try {
      const ticket = await getTicketForUser(Number(req.params.id), req.user.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (ticket.status === 'CLOSED') {
        return res.status(400).json({ error: 'This ticket is closed and can no longer accept replies' });
      }

      const { error: messageError, trimmed: trimmedMessage } = validateMessageLength(req.body?.message, {
        min: REPLY_MIN_LENGTH,
        max: REPLY_MAX_LENGTH,
      });
      if (messageError) return res.status(400).json({ error: messageError });

      const attachmentError = validateAttachment(req.file);
      if (attachmentError) return res.status(400).json({ error: attachmentError });

      const savedMessage = await createMessage({
        ticketId: ticket.id,
        senderType: 'USER',
        senderId: req.user.id,
        message: trimmedMessage,
        file: req.file,
      });
      const updatedTicket = await onUserReply(ticket);

      try {
        const assignedAdmin = updatedTicket.assigned_to ? await findUserById(updatedTicket.assigned_to) : null;
        await sendUserReplyEmail({
          ticket: updatedTicket,
          userEmail: req.user.email,
          recipientEmail: assignedAdmin?.email || null,
          message: trimmedMessage,
          attachment: req.file,
        });
      } catch (emailError) {
        console.error(`[support] reply on ticket #${ticket.id} saved but notification email failed`, emailError);
      }

      return res.status(201).json({ ok: true, ticket: updatedTicket, message: savedMessage });
    } catch (error) {
      return next(error);
    }
  }
);

supportRouter.get('/messages/:messageId/attachment', async (req, res, next) => {
  try {
    const attachment = await getMessageAttachment(Number(req.params.messageId));
    if (!attachment || attachment.is_internal || !attachment.attachment_data) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    const ticket = await getTicketForUser(attachment.ticket_id, req.user.id);
    if (!ticket) return res.status(404).json({ error: 'Attachment not found' });

    res.setHeader('Content-Type', attachment.attachment_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.attachment_filename || 'file')}"`);
    return res.send(attachment.attachment_data);
  } catch (error) {
    return next(error);
  }
});
