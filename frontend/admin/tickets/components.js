import { icon } from '../../icons.js';
import { escapeHtml, formatRelativeTime } from '../../utils.js';
import { STATUS_LABELS, ADMIN_STATUS_LABELS, PRIORITY_LABELS, renderTicketConversationMarkup } from '../../support/components.js';
import { renderDataTable, renderSearchBar, renderFilterPanel, renderPagination, renderAdminBreadcrumb } from '../shared/components.js';

function statusBadge(status, labels = STATUS_LABELS) {
  return `<span class="badge badge-ticket-status-${status.toLowerCase()}">${escapeHtml(labels[status] || status)}</span>`;
}

function priorityBadge(priority) {
  return `<span class="badge badge-priority-${priority}">${escapeHtml(PRIORITY_LABELS[priority] || priority)}</span>`;
}

function renderMessageBubble({ message, mine, senderLabel, attachmentUrl }) {
  const initial = (senderLabel || '?').trim().charAt(0).toUpperCase();
  const formatTimestamp = (value) => {
    if (!value) return '';
    const date = new Date(`${value.replace(' ', 'T')}Z`);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };
  return `
    <div class="message-row ${mine ? 'message-row-mine' : 'message-row-theirs'}">
      <span class="message-avatar">${escapeHtml(initial)}</span>
      <div class="message-bubble">
        <div class="message-meta">
          <span class="message-sender">${escapeHtml(senderLabel)}</span>
          <span class="message-time">${formatTimestamp(message.created_at)}</span>
        </div>
        <p class="message-text">${escapeHtml(message.message)}</p>
        ${
          message.attachment_filename && attachmentUrl
            ? `<button type="button" class="message-attachment-chip" data-attachment-url="${escapeHtml(attachmentUrl)}" data-attachment-filename="${escapeHtml(message.attachment_filename)}">${icon('paperclip')}<span>${escapeHtml(message.attachment_filename)}</span></button>`
            : ''
        }
      </div>
    </div>
  `;
}

export function renderAdminTicketsPageMarkup({ tickets, total, page, pageSize, search, status, priority, assignedTo, sort, order, loading }) {
  const columns = [
    { label: 'Ticket' },
    { label: 'Subject' },
    { label: 'User / Email' },
    { label: 'Status' },
    { label: 'Priority' },
    { label: 'Last Updated' },
    { label: 'Assigned' },
  ];
  const rows = tickets.map((ticket) => [
    `<span class="ticket-row-number">${escapeHtml(ticket.ticket_number)}</span>`,
    `<span class="ticket-row-subject">${escapeHtml(ticket.subject)}</span>`,
    `<span class="ticket-row-user">${escapeHtml(ticket.user_email || 'Unknown')}</span>`,
    statusBadge(ticket.status, ADMIN_STATUS_LABELS),
    priorityBadge(ticket.priority),
    `<span class="ticket-row-updated">${escapeHtml(formatRelativeTime(ticket.updated_at))}</span>`,
    `<span class="ticket-row-assigned">${escapeHtml(ticket.assigned_admin_email || 'Unassigned')}</span>`,
  ]);

  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'open', label: 'Open (not closed)' },
    ...Object.keys(STATUS_LABELS).map((v) => ({ value: v, label: STATUS_LABELS[v] })),
  ];
  const priorityOptions = [{ value: 'all', label: 'All priorities' }, ...Object.keys(PRIORITY_LABELS).map((v) => ({ value: v, label: PRIORITY_LABELS[v] }))];
  const assignedOptions = [
    { value: 'all', label: 'Anyone' },
    { value: 'unassigned', label: 'Unassigned' },
    { value: 'me', label: 'Assigned to me' },
  ];
  const sortOptions = [
    ['updated_at', 'Last Updated'],
    ['created_at', 'Created'],
    ['status', 'Status'],
    ['priority', 'Priority'],
  ];

  const body = loading
    ? '<p class="muted ticket-table-empty">Loading tickets&hellip;</p>'
    : tickets.length
      ? `
        ${renderDataTable({ columns, rows, rowKeys: tickets.map((t) => t.id), onRowClickAttr: 'data-ticket-id', className: 'admin-ticket-row', loading: false, startIndex: (page - 1) * pageSize + 1 })}
        ${renderPagination({ page, pageSize, total, idPrefix: 'admin-tickets' })}
      `
      : '<p class="muted ticket-table-empty">No contact requests match your filters.</p>';

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-dashboard-breadcrumb-btn', label: 'Dashboard' }], current: 'Support Tickets' })}
    <header class="page-header">
      <div>
        <h1 class="page-title">Support Tickets</h1>
        <p class="page-subtitle">All support tickets submitted through Contact Us.</p>
      </div>
    </header>
    <div class="ticket-filters">
      ${renderSearchBar({ idPrefix: 'admin-tickets', placeholder: 'Search tickets...', value: search })}
      ${renderFilterPanel({
        idPrefix: 'admin-tickets',
        filters: [
          { id: 'status', label: 'Status', options: statusOptions, value: status },
          { id: 'priority', label: 'Priority', options: priorityOptions, value: priority },
          { id: 'assigned', label: 'Assigned', options: assignedOptions, value: assignedTo },
        ],
      })}
      <div class="ticket-sort-control">
        <select id="admin-tickets-sort-select" class="ticket-filter-select">
          ${sortOptions.map(([value, label]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <button type="button" id="admin-tickets-order-btn" class="btn btn-secondary btn-sm">${order === 'asc' ? '↑ Asc' : '↓ Desc'}</button>
      </div>
    </div>
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
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-ticket-back-btn', label: 'Support Tickets' }], current: ticket.ticket_number })}
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
          <p class="muted">Visible to admins only. Designed so file attachments can be added to notes later without a layout change.</p>
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
