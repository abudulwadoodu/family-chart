import { query } from '../db/index.js';
import { touchUpdatedAt } from './ticketModel.js';

const MESSAGE_LIST_COLUMNS = `
  id, ticket_id, sender_type, sender_id, message, is_internal,
  attachment_filename, attachment_mimetype, attachment_size, created_at
`;

export async function createMessage({ ticketId, senderType, senderId, message, isInternal = false, file }) {
  const { rows } = await query(
    `INSERT INTO support_messages
       (ticket_id, sender_type, sender_id, message, is_internal,
        attachment_filename, attachment_mimetype, attachment_size, attachment_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      ticketId,
      senderType,
      senderId,
      message,
      Boolean(isInternal),
      file?.originalname || null,
      file?.mimetype || null,
      file?.size || null,
      file?.buffer || null,
    ]
  );
  await touchUpdatedAt(ticketId);
  return getMessageById(rows[0].id);
}

export async function getMessageById(messageId) {
  const { rows } = await query(`SELECT ${MESSAGE_LIST_COLUMNS} FROM support_messages WHERE id = $1`, [messageId]);
  return rows[0];
}

export async function getMessageAttachment(messageId) {
  const { rows } = await query(
    `SELECT id, ticket_id, is_internal, attachment_filename, attachment_mimetype, attachment_data
     FROM support_messages WHERE id = $1`,
    [messageId]
  );
  return rows[0];
}

export async function listMessagesForTicket(ticketId, { includeInternal = false } = {}) {
  const where = includeInternal ? 'ticket_id = $1' : 'ticket_id = $1 AND is_internal = false';
  const { rows } = await query(
    `SELECT ${MESSAGE_LIST_COLUMNS} FROM support_messages WHERE ${where} ORDER BY created_at ASC, id ASC`,
    [ticketId]
  );
  return rows;
}
