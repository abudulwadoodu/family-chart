import { api, fetchAttachment } from '../api.js';
import { showToast } from '../ui.js';
import { downloadBlob } from '../utils.js';
import { STATUS_LABELS } from './components.js';

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function scrollThreadToBottom() {
  const thread = document.querySelector('#message-thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function attachAttachmentDownloadListeners() {
  document.querySelectorAll('.message-attachment-chip').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const { blob } = await fetchAttachment(btn.dataset.attachmentUrl);
        downloadBlob(blob, btn.dataset.attachmentFilename || 'attachment');
      } catch (error) {
        showToast(error.message || 'Could not download attachment.', { type: 'error' });
      }
    });
  });
}

export function attachmentUrlForUser(message) {
  return message.attachment_filename ? `/api/support/messages/${message.id}/attachment` : null;
}

export function attachmentUrlForAdmin(ticketId) {
  return (message) =>
    message.attachment_filename ? `/api/admin/support/tickets/${ticketId}/messages/${message.id}/attachment` : null;
}

function wireFileTrigger({ fileInputId, fileTriggerId, fileNameId }) {
  const fileInput = document.querySelector(`#${fileInputId}`);
  const trigger = document.querySelector(`#${fileTriggerId}`);
  const nameEl = document.querySelector(`#${fileNameId}`);
  if (!fileInput || !trigger || !nameEl) return;
  trigger.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    nameEl.textContent = file ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)` : 'No file selected';
  });
}

function attachReplyForm({ render, onSubmit }) {
  const form = document.querySelector('#ticket-reply-form');
  if (!form) return;
  wireFileTrigger({ fileInputId: 'ticket-reply-file-input', fileTriggerId: 'ticket-reply-file-trigger-btn', fileNameId: 'ticket-reply-file-name' });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorEl = document.querySelector('#ticket-reply-error');
    if (errorEl) errorEl.textContent = '';
    const submitBtn = document.querySelector('#ticket-reply-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('span').textContent = 'Sending...';
    }

    try {
      await onSubmit(new FormData(form));
      render();
      scrollThreadToBottom();
      showToast('Reply sent.');
    } catch (error) {
      const message = error.message || 'Could not send your reply.';
      if (errorEl) errorEl.textContent = message;
      showToast(message, { type: 'error' });
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = 'Reply';
      }
    }
  });
}

function attachInternalNoteForm({ state, render, ticketId }) {
  const form = document.querySelector('#internal-note-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = String(new FormData(form).get('message') || '').trim();
    if (!message) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('message', message);
      formData.append('isInternal', 'true');
      const payload = await api(`/api/admin/support/tickets/${ticketId}/messages`, { method: 'POST', body: formData });
      state.admin.selectedTicket = payload.ticket;
      state.admin.selectedNotes = [...state.admin.selectedNotes, payload.message];
      render();
      showToast('Internal note added.');
    } catch (error) {
      showToast(error.message || 'Could not add note.', { type: 'error' });
      submitBtn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Contact Us -> ticket creation
// ---------------------------------------------------------------------------

export async function createTicketFromContact(state, render, formData) {
  const payload = await api('/api/support/tickets', { method: 'POST', body: formData });
  state.dashboardView = 'ticketDetail';
  state.support.selectedTicketId = payload.ticket.id;
  state.support.selectedTicket = payload.ticket;
  state.support.selectedMessages = [];
  render();
  await loadTicketDetail(state, render, payload.ticket.id);
  return payload.ticket;
}

// ---------------------------------------------------------------------------
// My Support Tickets (user-facing)
// ---------------------------------------------------------------------------

export async function loadMyTickets(state, render) {
  state.support.loading = true;
  render();
  try {
    const { search, status, priority, page, pageSize } = state.support;
    const params = new URLSearchParams({ page, pageSize, sort: 'updated_at', order: 'desc' });
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);
    if (priority !== 'all') params.set('priority', priority);

    const payload = await api(`/api/support/tickets?${params.toString()}`);
    state.support.tickets = payload.tickets;
    state.support.total = payload.total;
    state.support.loaded = true;
  } catch (error) {
    showToast(error.message || 'Could not load your tickets.', { type: 'error' });
  } finally {
    state.support.loading = false;
    render();
  }
}

const debouncedMyTicketsSearch = debounce((state, render) => {
  state.support.page = 1;
  loadMyTickets(state, render);
}, 300);

export function attachMyTicketsListeners(state, render) {
  document.querySelector('#my-tickets-search-input').addEventListener('input', (event) => {
    state.support.search = event.target.value;
    debouncedMyTicketsSearch(state, render);
  });
  document.querySelector('#my-tickets-status-select').addEventListener('change', (event) => {
    state.support.status = event.target.value;
    state.support.page = 1;
    loadMyTickets(state, render);
  });
  document.querySelector('#my-tickets-priority-select').addEventListener('change', (event) => {
    state.support.priority = event.target.value;
    state.support.page = 1;
    loadMyTickets(state, render);
  });
  document.querySelector('#my-tickets-prev-btn')?.addEventListener('click', () => {
    if (state.support.page <= 1) return;
    state.support.page -= 1;
    loadMyTickets(state, render);
  });
  document.querySelector('#my-tickets-next-btn')?.addEventListener('click', () => {
    state.support.page += 1;
    loadMyTickets(state, render);
  });
  document.querySelectorAll('.ticket-row[data-ticket-id]').forEach((row) => {
    row.addEventListener('click', () => {
      state.dashboardView = 'ticketDetail';
      state.support.selectedTicketId = Number(row.dataset.ticketId);
      render();
      loadTicketDetail(state, render, Number(row.dataset.ticketId));
    });
  });
}

export async function loadTicketDetail(state, render, ticketId) {
  state.support.selectedLoading = true;
  render();
  try {
    const payload = await api(`/api/support/tickets/${ticketId}`);
    state.support.selectedTicket = payload.ticket;
    state.support.selectedMessages = payload.messages;
  } catch (error) {
    showToast(error.message || 'Could not load this ticket.', { type: 'error' });
    state.dashboardView = 'myTickets';
  } finally {
    state.support.selectedLoading = false;
    render();
  }
}

export function attachTicketDetailListeners(state, render) {
  scrollThreadToBottom();
  document.querySelector('#ticket-detail-back-btn').addEventListener('click', () => {
    state.dashboardView = 'myTickets';
    render();
    loadMyTickets(state, render);
  });
  attachAttachmentDownloadListeners();
  attachReplyForm({
    render,
    onSubmit: async (formData) => {
      const ticketId = state.support.selectedTicketId;
      const payload = await api(`/api/support/tickets/${ticketId}/messages`, { method: 'POST', body: formData });
      state.support.selectedTicket = payload.ticket;
      state.support.selectedMessages = [...state.support.selectedMessages, payload.message];
    },
  });
}

// ---------------------------------------------------------------------------
// Admin Portal
// ---------------------------------------------------------------------------

export async function loadAdminSection(state, render) {
  if (state.admin.section === 'dashboard') return loadAdminDashboard(state, render);
  if (state.admin.section === 'tickets') return loadAdminTickets(state, render);
  return undefined;
}

async function loadAdminDashboard(state, render) {
  state.admin.dashboardLoading = true;
  render();
  try {
    const counts = {};
    await Promise.all(
      Object.keys(STATUS_LABELS).map(async (status) => {
        const payload = await api(`/api/admin/support/tickets?status=${status}&pageSize=1`);
        counts[status] = payload.total;
      })
    );
    state.admin.dashboardCounts = counts;
  } catch (error) {
    showToast(error.message || 'Could not load the dashboard.', { type: 'error' });
  } finally {
    state.admin.dashboardLoading = false;
    render();
  }
}

async function loadAdminTickets(state, render) {
  state.admin.loading = true;
  render();
  try {
    const { search, status, priority, assignedTo, sort, order, page, pageSize } = state.admin;
    const params = new URLSearchParams({ page, pageSize, sort, order });
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);
    if (priority !== 'all') params.set('priority', priority);
    if (assignedTo === 'unassigned') params.set('assignedTo', 'unassigned');
    else if (assignedTo === 'me') params.set('assignedTo', String(state.user.id));

    const payload = await api(`/api/admin/support/tickets?${params.toString()}`);
    state.admin.tickets = payload.tickets;
    state.admin.total = payload.total;
  } catch (error) {
    showToast(error.message || 'Could not load contact requests.', { type: 'error' });
  } finally {
    state.admin.loading = false;
    render();
  }
}

const debouncedAdminTicketsSearch = debounce((state, render) => {
  state.admin.page = 1;
  loadAdminTickets(state, render);
}, 300);

function attachAdminTicketsListeners(state, render) {
  document.querySelector('#admin-tickets-search-input').addEventListener('input', (event) => {
    state.admin.search = event.target.value;
    debouncedAdminTicketsSearch(state, render);
  });
  document.querySelector('#admin-tickets-status-select').addEventListener('change', (event) => {
    state.admin.status = event.target.value;
    state.admin.page = 1;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-priority-select').addEventListener('change', (event) => {
    state.admin.priority = event.target.value;
    state.admin.page = 1;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-assigned-select').addEventListener('change', (event) => {
    state.admin.assignedTo = event.target.value;
    state.admin.page = 1;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-sort-select').addEventListener('change', (event) => {
    state.admin.sort = event.target.value;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-order-btn').addEventListener('click', () => {
    state.admin.order = state.admin.order === 'asc' ? 'desc' : 'asc';
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-prev-btn')?.addEventListener('click', () => {
    if (state.admin.page <= 1) return;
    state.admin.page -= 1;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-next-btn')?.addEventListener('click', () => {
    state.admin.page += 1;
    loadAdminTickets(state, render);
  });
  document.querySelectorAll('.admin-ticket-row[data-ticket-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const ticketId = Number(row.dataset.ticketId);
      state.admin.section = 'ticketDetail';
      state.admin.selectedTicketId = ticketId;
      render();
      loadAdminTicketDetail(state, render, ticketId);
    });
  });
}

async function loadAdminTicketDetail(state, render, ticketId) {
  state.admin.selectedLoading = true;
  render();
  try {
    const payload = await api(`/api/admin/support/tickets/${ticketId}`);
    state.admin.selectedTicket = payload.ticket;
    state.admin.selectedOwner = payload.owner;
    state.admin.selectedMessages = payload.messages.filter((message) => !message.is_internal);
    state.admin.selectedNotes = payload.messages.filter((message) => message.is_internal);
  } catch (error) {
    showToast(error.message || 'Could not load this ticket.', { type: 'error' });
    state.admin.section = 'tickets';
  } finally {
    state.admin.selectedLoading = false;
    render();
  }
}

async function updateAdminTicket(state, render, ticketId, body) {
  try {
    const payload = await api(`/api/admin/support/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify(body) });
    state.admin.selectedTicket = payload.ticket;
    render();
    showToast('Ticket updated.');
  } catch (error) {
    showToast(error.message || 'Could not update the ticket.', { type: 'error' });
    render();
  }
}

function attachAdminTicketDetailListeners(state, render) {
  scrollThreadToBottom();
  const ticketId = state.admin.selectedTicketId;

  document.querySelector('#admin-ticket-back-btn').addEventListener('click', () => {
    state.admin.section = 'tickets';
    render();
    loadAdminTickets(state, render);
  });
  attachAttachmentDownloadListeners();
  attachReplyForm({
    render,
    onSubmit: async (formData) => {
      const payload = await api(`/api/admin/support/tickets/${ticketId}/messages`, { method: 'POST', body: formData });
      state.admin.selectedTicket = payload.ticket;
      state.admin.selectedMessages = [...state.admin.selectedMessages, payload.message];
    },
  });
  attachInternalNoteForm({ state, render, ticketId });

  document.querySelector('#admin-ticket-status-select').addEventListener('change', (event) => {
    updateAdminTicket(state, render, ticketId, { status: event.target.value });
  });
  document.querySelector('#admin-ticket-priority-select').addEventListener('change', (event) => {
    updateAdminTicket(state, render, ticketId, { priority: event.target.value });
  });
  document.querySelector('#admin-ticket-assign-btn')?.addEventListener('click', () => {
    updateAdminTicket(state, render, ticketId, { assignedTo: state.user.id });
  });
  document.querySelector('#admin-ticket-unassign-btn')?.addEventListener('click', () => {
    updateAdminTicket(state, render, ticketId, { assignedTo: null });
  });
}

export function attachAdminListeners(state, render) {
  document.querySelectorAll('[data-admin-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled || btn.dataset.adminSection === state.admin.section) return;
      state.admin.section = btn.dataset.adminSection;
      state.admin.page = 1;
      render();
      loadAdminSection(state, render);
    });
  });

  if (state.admin.section === 'tickets') return attachAdminTicketsListeners(state, render);
  if (state.admin.section === 'ticketDetail') {
    if (state.admin.selectedTicket) attachAdminTicketDetailListeners(state, render);
    return;
  }
  return undefined;
}
