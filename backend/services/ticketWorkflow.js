import { updateTicketStatus } from '../models/ticketModel.js';

// A user reply always signals the ticket needs attention again, even if it had
// already been marked resolved.
export function onUserReply(ticket) {
  if (ticket.status === 'IN_PROGRESS') return ticket;
  return updateTicketStatus(ticket.id, 'IN_PROGRESS');
}

// Internal notes are admin-only bookkeeping and must never move the
// customer-facing status.
export function onAdminReply(ticket, { isInternal }) {
  if (isInternal) return ticket;
  if (ticket.status === 'WAITING_FOR_USER') return ticket;
  return updateTicketStatus(ticket.id, 'WAITING_FOR_USER');
}
