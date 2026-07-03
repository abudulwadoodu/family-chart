import { icon } from '../icons.js';
import { escapeHtml, formatRelativeTime } from '../utils.js';

export const STATUS_LABELS = {
  NEW: 'New',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_USER: 'Waiting for You',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const ADMIN_STATUS_LABELS = { ...STATUS_LABELS, WAITING_FOR_USER: 'Waiting for User' };

export const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

function statusBadge(status, labels = STATUS_LABELS) {
  return `<span class="badge badge-ticket-status-${status.toLowerCase()}">${escapeHtml(labels[status] || status)}</span>`;
}

function priorityBadge(priority) {
  return `<span class="badge badge-priority-${priority}">${escapeHtml(PRIORITY_LABELS[priority] || priority)}</span>`;
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function renderPagination({ page, pageSize, total, idPrefix }) {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  return `
    <div class="ticket-pagination">
      <span class="ticket-pagination-label">Page ${page} of ${totalPages} &middot; ${total} ticket${total === 1 ? '' : 's'}</span>
      <div class="ticket-pagination-actions">
        <button type="button" id="${idPrefix}-prev-btn" class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <button type="button" id="${idPrefix}-next-btn" class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;
}

function renderTicketFilters({ idPrefix, search, status, priority, extra = '' }) {
  const statusOptions = ['all', ...Object.keys(STATUS_LABELS)]
    .map((value) => `<option value="${value}" ${status === value ? 'selected' : ''}>${value === 'all' ? 'All statuses' : STATUS_LABELS[value]}</option>`)
    .join('');
  const priorityOptions = ['all', ...Object.keys(PRIORITY_LABELS)]
    .map((value) => `<option value="${value}" ${priority === value ? 'selected' : ''}>${value === 'all' ? 'All priorities' : PRIORITY_LABELS[value]}</option>`)
    .join('');

  return `
    <div class="ticket-filters">
      <label class="search-box ticket-search-box">
        ${icon('search')}
        <input type="search" id="${idPrefix}-search-input" placeholder="Search tickets..." value="${escapeHtml(search)}" />
      </label>
      <select id="${idPrefix}-status-select" class="ticket-filter-select">${statusOptions}</select>
      <select id="${idPrefix}-priority-select" class="ticket-filter-select">${priorityOptions}</select>
      ${extra}
    </div>
  `;
}

export function renderMyTicketsPageMarkup({ tickets, total, page, pageSize, search, status, priority, loading }) {
  const rows = tickets
    .map(
      (ticket) => `
    <button type="button" class="ticket-row" data-ticket-id="${ticket.id}">
      <span class="ticket-row-number">${escapeHtml(ticket.ticket_number)}</span>
      <span class="ticket-row-subject">${escapeHtml(ticket.subject)}</span>
      ${statusBadge(ticket.status)}
      ${priorityBadge(ticket.priority)}
      <span class="ticket-row-updated">${escapeHtml(formatRelativeTime(ticket.updated_at))}</span>
    </button>`
    )
    .join('');

  const body = loading
    ? '<p class="muted ticket-table-empty">Loading tickets&hellip;</p>'
    : tickets.length
      ? `
        <div class="ticket-table" role="table">
          <div class="ticket-table-head" role="row">
            <span>Ticket</span><span>Subject</span><span>Status</span><span>Priority</span><span>Last Updated</span>
          </div>
          ${rows}
        </div>
        ${renderPagination({ page, pageSize, total, idPrefix: 'my-tickets' })}
      `
      : '<p class="muted ticket-table-empty">No support tickets yet. Use Contact Us to start one.</p>';

  return `
    <div class="ticket-page">
      <header class="page-header">
        <div>
          <h1 class="page-title">My Support Tickets</h1>
          <p class="page-subtitle">Track replies and follow up on requests you've sent to support.</p>
        </div>
      </header>
      ${renderTicketFilters({ idPrefix: 'my-tickets', search, status, priority })}
      ${body}
    </div>
  `;
}

function renderAttachmentChip(message, attachmentUrl) {
  if (!message.attachment_filename || !attachmentUrl) return '';
  return `
    <button type="button" class="message-attachment-chip" data-attachment-url="${escapeHtml(attachmentUrl)}" data-attachment-filename="${escapeHtml(message.attachment_filename)}">
      ${icon('paperclip')}<span>${escapeHtml(message.attachment_filename)}</span>
    </button>
  `;
}

function renderMessageBubble({ message, mine, senderLabel, attachmentUrl }) {
  const initial = (senderLabel || '?').trim().charAt(0).toUpperCase();
  return `
    <div class="message-row ${mine ? 'message-row-mine' : 'message-row-theirs'}">
      <span class="message-avatar">${escapeHtml(initial)}</span>
      <div class="message-bubble">
        <div class="message-meta">
          <span class="message-sender">${escapeHtml(senderLabel)}</span>
          <span class="message-time">${formatTimestamp(message.created_at)}</span>
        </div>
        <p class="message-text">${escapeHtml(message.message)}</p>
        ${renderAttachmentChip(message, attachmentUrl)}
      </div>
    </div>
  `;
}

// Shared by the user-facing ticket page and the admin ticket detail page.
// `viewerType` ('USER' or 'ADMIN') decides which side of the thread a message
// renders on - the viewer's own sender type is always shown on the right.
export function renderTicketConversationMarkup({ messages, viewerType, attachmentUrlFor, closed, busy }) {
  const thread = messages.length
    ? messages
        .map((message) =>
          renderMessageBubble({
            message,
            mine: message.sender_type === viewerType,
            senderLabel: message.sender_type === 'ADMIN' ? 'Support' : viewerType === 'USER' ? 'You' : 'Customer',
            attachmentUrl: attachmentUrlFor(message),
          })
        )
        .join('')
    : '<p class="muted">No messages yet.</p>';

  const replyForm = closed
    ? '<p class="ticket-closed-note muted">This ticket is closed and can no longer accept replies.</p>'
    : `
      <form id="ticket-reply-form" class="ticket-reply-form">
        <textarea name="message" id="ticket-reply-input" rows="3" maxlength="5000" placeholder="Write a reply&hellip;" required></textarea>
        <div class="ticket-reply-row">
          <input type="file" name="file" id="ticket-reply-file-input" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,image/*,application/pdf,text/plain" hidden />
          <button type="button" id="ticket-reply-file-trigger-btn" class="btn btn-secondary btn-sm">${icon('upload')}<span>Attach file</span></button>
          <span class="contact-file-name" id="ticket-reply-file-name">No file selected</span>
          <button type="submit" id="ticket-reply-submit-btn" class="btn btn-primary btn-sm" ${busy ? 'disabled' : ''}><span>Reply</span></button>
        </div>
        <p id="ticket-reply-error" class="error" role="alert"></p>
      </form>
    `;

  return `<div class="message-thread" id="message-thread">${thread}</div>${replyForm}`;
}

export function renderTicketDetailPageMarkup({ ticket, messages, attachmentUrlFor, busy }) {
  const closed = ticket.status === 'CLOSED';
  return `
    <div class="ticket-page ticket-detail-page">
      <button type="button" id="ticket-detail-back-btn" class="breadcrumb-link ticket-back-btn">&larr; Back to My Support Tickets</button>
      <header class="ticket-detail-header">
        <div>
          <p class="ticket-detail-number">${escapeHtml(ticket.ticket_number)}</p>
          <h1 class="page-title">${escapeHtml(ticket.subject)}</h1>
          <p class="page-subtitle">${escapeHtml(ticket.category)}</p>
        </div>
        <div class="ticket-detail-badges">${statusBadge(ticket.status)}${priorityBadge(ticket.priority)}</div>
      </header>
      <section class="card ticket-conversation-card">
        ${renderTicketConversationMarkup({ messages, viewerType: 'USER', attachmentUrlFor, closed, busy })}
      </section>
    </div>
  `;
}
