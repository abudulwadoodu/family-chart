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

export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', enabled: true },
  { id: 'tickets', label: 'Contact Requests', enabled: true },
  { id: 'reportedContent', label: 'Reported Content', enabled: false },
  { id: 'users', label: 'Users', enabled: false },
  { id: 'familyTrees', label: 'Family Trees', enabled: false },
];

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

function renderSortControl({ idPrefix, sort, order }) {
  const options = [
    ['updated_at', 'Last Updated'],
    ['created_at', 'Created'],
    ['status', 'Status'],
    ['priority', 'Priority'],
  ]
    .map(([value, label]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${label}</option>`)
    .join('');
  return `
    <div class="ticket-sort-control">
      <select id="${idPrefix}-sort-select" class="ticket-filter-select">${options}</select>
      <button type="button" id="${idPrefix}-order-btn" class="btn btn-secondary btn-sm">${order === 'asc' ? '↑ Asc' : '↓ Desc'}</button>
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

export function renderAdminPageMarkup({ section, content }) {
  const navButtons = ADMIN_NAV_ITEMS.map(
    (item) => `
    <button type="button" class="admin-nav-item ${section === item.id ? 'admin-nav-item-active' : ''}" data-admin-section="${item.id}" ${item.enabled ? '' : 'disabled title="Coming soon"'}>
      <span>${escapeHtml(item.label)}</span>${item.enabled ? '' : '<span class="admin-nav-soon">Soon</span>'}
    </button>`
  ).join('');

  return `
    <div class="admin-shell">
      <nav class="admin-nav" aria-label="Admin">${navButtons}</nav>
      <div class="admin-content">${content}</div>
    </div>
  `;
}

export function renderAdminDashboardMarkup({ counts, loading }) {
  if (loading) return '<p class="muted">Loading dashboard&hellip;</p>';

  const cards = Object.keys(STATUS_LABELS)
    .map(
      (status) => `
    <div class="card admin-stat-card">
      <p class="admin-stat-value">${counts[status] ?? 0}</p>
      <p class="admin-stat-label">${escapeHtml(ADMIN_STATUS_LABELS[status])}</p>
    </div>`
    )
    .join('');

  return `
    <header class="page-header">
      <div>
        <h1 class="page-title">Admin Dashboard</h1>
        <p class="page-subtitle">Ticket volume by status.</p>
      </div>
    </header>
    <div class="admin-stat-grid">${cards}</div>
  `;
}

export function renderAdminTicketsTableMarkup({ tickets, total, page, pageSize, search, status, priority, assignedTo, sort, order, loading }) {
  const rows = tickets
    .map(
      (ticket) => `
    <button type="button" class="ticket-row admin-ticket-row" data-ticket-id="${ticket.id}">
      <span class="ticket-row-number">${escapeHtml(ticket.ticket_number)}</span>
      <span class="ticket-row-subject">${escapeHtml(ticket.subject)}</span>
      <span class="ticket-row-user">${escapeHtml(ticket.user_email || 'Unknown')}</span>
      ${statusBadge(ticket.status, ADMIN_STATUS_LABELS)}
      ${priorityBadge(ticket.priority)}
      <span class="ticket-row-updated">${escapeHtml(formatRelativeTime(ticket.updated_at))}</span>
      <span class="ticket-row-assigned">${escapeHtml(ticket.assigned_admin_email || 'Unassigned')}</span>
    </button>`
    )
    .join('');

  const assignedOptions = [
    ['all', 'Anyone'],
    ['unassigned', 'Unassigned'],
    ['me', 'Assigned to me'],
  ]
    .map(([value, label]) => `<option value="${value}" ${assignedTo === value ? 'selected' : ''}>${label}</option>`)
    .join('');

  const body = loading
    ? '<p class="muted ticket-table-empty">Loading tickets&hellip;</p>'
    : tickets.length
      ? `
        <div class="ticket-table admin-ticket-table" role="table">
          <div class="ticket-table-head admin-ticket-table-head" role="row">
            <span>Ticket</span><span>Subject</span><span>User / Email</span><span>Status</span><span>Priority</span><span>Last Updated</span><span>Assigned</span>
          </div>
          ${rows}
        </div>
        ${renderPagination({ page, pageSize, total, idPrefix: 'admin-tickets' })}
      `
      : '<p class="muted ticket-table-empty">No contact requests match your filters.</p>';

  return `
    <header class="page-header">
      <div>
        <h1 class="page-title">Contact Requests</h1>
        <p class="page-subtitle">All support tickets submitted through Contact Us.</p>
      </div>
    </header>
    ${renderTicketFilters({
      idPrefix: 'admin-tickets',
      search,
      status,
      priority,
      extra: `<select id="admin-tickets-assigned-select" class="ticket-filter-select">${assignedOptions}</select>${renderSortControl({ idPrefix: 'admin-tickets', sort, order })}`,
    })}
    ${body}
  `;
}

export function renderAdminTicketDetailMarkup({ ticket, owner, messages, internalNotes, attachmentUrlFor, currentAdminId, busy }) {
  const closed = ticket.status === 'CLOSED';
  const statusOptions = Object.keys(STATUS_LABELS)
    .map((value) => `<option value="${value}" ${ticket.status === value ? 'selected' : ''}>${ADMIN_STATUS_LABELS[value]}</option>`)
    .join('');
  const priorityOptions = Object.keys(PRIORITY_LABELS)
    .map((value) => `<option value="${value}" ${ticket.priority === value ? 'selected' : ''}>${PRIORITY_LABELS[value]}</option>`)
    .join('');
  const isAssignedToMe = ticket.assigned_to === currentAdminId;

  const notesThread = internalNotes.length
    ? internalNotes
        .map((note) => renderMessageBubble({ message: note, mine: false, senderLabel: 'Internal note', attachmentUrl: attachmentUrlFor(note) }))
        .join('')
    : '<p class="muted">No internal notes yet.</p>';

  return `
    <button type="button" id="admin-ticket-back-btn" class="breadcrumb-link ticket-back-btn">&larr; Back to Contact Requests</button>
    <div class="ticket-detail-grid">
      <section class="card ticket-conversation-card">
        <header class="ticket-detail-header">
          <div>
            <p class="ticket-detail-number">${escapeHtml(ticket.ticket_number)}</p>
            <h1 class="page-title">${escapeHtml(ticket.subject)}</h1>
            <p class="page-subtitle">${escapeHtml(ticket.category)}</p>
          </div>
        </header>
        ${renderTicketConversationMarkup({ messages, viewerType: 'ADMIN', attachmentUrlFor, closed, busy })}
      </section>
      <aside class="ticket-side-panel">
        <section class="card">
          <h2 class="contact-card-title">Requester</h2>
          <div class="member-info">
            <span class="user-avatar user-avatar-sm">${escapeHtml((owner?.email || '?').charAt(0).toUpperCase())}</span>
            <p class="member-email">${escapeHtml(owner?.email || 'Unknown')}</p>
          </div>
        </section>
        <section class="card">
          <h2 class="contact-card-title">Ticket settings</h2>
          <label>Status
            <select id="admin-ticket-status-select">${statusOptions}</select>
          </label>
          <label>Priority
            <select id="admin-ticket-priority-select">${priorityOptions}</select>
          </label>
          <div class="ticket-assign-row">
            ${
              isAssignedToMe
                ? '<button type="button" id="admin-ticket-unassign-btn" class="btn btn-secondary btn-sm">Unassign from me</button>'
                : '<button type="button" id="admin-ticket-assign-btn" class="btn btn-secondary btn-sm">Assign to me</button>'
            }
          </div>
        </section>
        <section class="card internal-notes-panel">
          <h2 class="contact-card-title">Internal Notes</h2>
          <p class="muted">Visible to admins only.</p>
          <div class="message-thread internal-notes-thread">${notesThread}</div>
          <form id="internal-note-form" class="ticket-reply-form">
            <textarea name="message" id="internal-note-input" rows="2" maxlength="5000" placeholder="Add an internal note&hellip;" required></textarea>
            <button type="submit" class="btn btn-secondary btn-sm">Add Note</button>
          </form>
        </section>
      </aside>
    </div>
  `;
}
