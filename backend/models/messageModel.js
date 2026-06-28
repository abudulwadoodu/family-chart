import { getDb } from '../db/index.js';
import { touchUpdatedAt } from './ticketModel.js';

const MESSAGE_LIST_COLUMNS = `
  id, ticket_id, sender_type, sender_id, message, is_internal,
  attachment_filename, attachment_mimetype, attachment_size, created_at
`;

export function createMessage({ ticketId, senderType, senderId, message, isInternal = false, file }) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO support_messages
         (ticket_id, sender_type, sender_id, message, is_internal,
          attachment_filename, attachment_mimetype, attachment_size, attachment_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      ticketId,
      senderType,
      senderId,
      message,
      isInternal ? 1 : 0,
      file?.originalname || null,
      file?.mimetype || null,
      file?.size || null,
      file?.buffer || null
    );
  touchUpdatedAt(ticketId);
  return getMessageById(result.lastInsertRowid);
}

export function getMessageById(messageId) {
  const db = getDb();
  return db.prepare(`SELECT ${MESSAGE_LIST_COLUMNS} FROM support_messages WHERE id = ?`).get(messageId);
}

export function getMessageAttachment(messageId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, ticket_id, is_internal, attachment_filename, attachment_mimetype, attachment_data
       FROM support_messages WHERE id = ?`
    )
    .get(messageId);
}

export function listMessagesForTicket(ticketId, { includeInternal = false } = {}) {
  const db = getDb();
  const where = includeInternal ? 'ticket_id = ?' : 'ticket_id = ? AND is_internal = 0';
  return db
    .prepare(`SELECT ${MESSAGE_LIST_COLUMNS} FROM support_messages WHERE ${where} ORDER BY created_at ASC, id ASC`)
    .all(ticketId);
}
