import express from 'express';
import multer from 'multer';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { isNonEmptyString, isValidEmail } from '../utils/validation.js';
import { sendContactEmail } from '../utils/email.js';

export const CONTACT_SUBJECTS = [
  'General Question',
  'Technical Support',
  'Bug Report',
  'Feature Request',
  'Account Issue',
  'Billing',
  'Other',
];

const MESSAGE_MIN_LENGTH = 20;
const MESSAGE_MAX_LENGTH = 5000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];

export const contactRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } });

contactRouter.use(requireAuth);

function parseUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Attachment must be 10 MB or smaller' });
    return res.status(400).json({ error: 'Could not process the uploaded file' });
  });
}

contactRouter.post('/', rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }), parseUpload, async (req, res, next) => {
  try {
    const { name, email, subject, message, website } = req.body || {};

    // Honeypot field: real users never fill this in, so a non-empty value
    // means a bot submitted the form. Pretend success without storing or
    // emailing anything, so the bot doesn't learn its submission was rejected.
    if (website) return res.status(201).json({ ok: true });

    if (!isNonEmptyString(name, 120)) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!CONTACT_SUBJECTS.includes(subject)) {
      return res.status(400).json({ error: 'Please choose a valid subject' });
    }
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    if (trimmedMessage.length < MESSAGE_MIN_LENGTH || trimmedMessage.length > MESSAGE_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `Message must be between ${MESSAGE_MIN_LENGTH} and ${MESSAGE_MAX_LENGTH} characters` });
    }

    const file = req.file;
    if (file && !ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Attachments must be an image, PDF, or text file' });
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    const db = getDb();
    const insertResult = db
      .prepare(
        `INSERT INTO contact_submissions
           (user_id, name, email, subject, message, attachment_filename, attachment_mimetype, attachment_size, attachment_data, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(
        req.user.id,
        trimmedName,
        trimmedEmail,
        subject,
        trimmedMessage,
        file?.originalname || null,
        file?.mimetype || null,
        file?.size || null,
        file?.buffer || null
      );
    const submissionId = insertResult.lastInsertRowid;

    try {
      await sendContactEmail({ name: trimmedName, email: trimmedEmail, subject, message: trimmedMessage, attachment: file });
      db.prepare("UPDATE contact_submissions SET status = 'sent' WHERE id = ?").run(submissionId);
      console.log(`[contact] submission #${submissionId} from user ${req.user.id} sent (subject: ${subject})`);
      return res.status(201).json({ ok: true, id: submissionId });
    } catch (sendError) {
      db.prepare("UPDATE contact_submissions SET status = 'failed', error = ? WHERE id = ?").run(
        String(sendError.message || 'Unknown error').slice(0, 500),
        submissionId
      );
      console.error(`[contact] submission #${submissionId} failed to send`, sendError);
      return res
        .status(502)
        .json({ error: 'Your message was saved, but we could not send it right now. Please try again later.' });
    }
  } catch (error) {
    return next(error);
  }
});
