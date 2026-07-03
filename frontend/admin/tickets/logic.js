import { api, fetchAttachment } from '../../api.js';
import { showToast } from '../../ui.js';
import { downloadBlob } from '../../utils.js';

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
      state.admin.tickets.selectedTicket = payload.ticket;
      state.admin.tickets.selectedNotes = [...state.admin.tickets.selectedNotes, payload.message];
      render();
      showToast('Internal note added.');
    } catch (error) {
      showToast(error.message || 'Could not add note.', { type: 'error' });
      submitBtn.disabled = false;
    }
  });
}

const initialTicketsState = { search: '', status: 'all', priority: 'all', assignedTo: 'all', sort: 'updated_at', order: 'desc', page: 1, pageSize: 20 };

export function createTicketsAdminState() {
  return {
    ...initialTicketsState,
    tickets: [],
    total: 0,
    selectedTicketId: null,
    selectedTicket: null,
    selectedOwner: null,
    selectedMessages: [],
    selectedNotes: [],
    selectedLoading: false,
  };
}

export async function loadAdminTickets(state, render) {
  state.admin.tickets.loading = true;
  render();
  try {
    const { search, status, priority, assignedTo, sort, order, page, pageSize } = state.admin.tickets;
    const params = new URLSearchParams({ page, pageSize, sort, order });
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);
    if (priority !== 'all') params.set('priority', priority);
    if (assignedTo === 'unassigned') params.set('assignedTo', 'unassigned');
    else if (assignedTo === 'me') params.set('assignedTo', String(state.user.id));

    const payload = await api(`/api/admin/support/tickets?${params.toString()}`);
    state.admin.tickets.tickets = payload.tickets;
    state.admin.tickets.total = payload.total;
  } catch (error) {
    showToast(error.message || 'Could not load support tickets.', { type: 'error' });
  } finally {
    state.admin.tickets.loading = false;
    render();
  }
}

const debouncedAdminTicketsSearch = debounce((state, render) => {
  state.admin.tickets.page = 1;
  loadAdminTickets(state, render);
}, 300);

export function attachAdminTicketsListeners(state, render) {
  document.querySelector('#admin-tickets-search-input').addEventListener('input', (event) => {
    state.admin.tickets.search = event.target.value;
    debouncedAdminTicketsSearch(state, render);
  });
  document.querySelector('#admin-tickets-status-select').addEventListener('change', (event) => {
    state.admin.tickets.status = event.target.value;
    state.admin.tickets.page = 1;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-priority-select').addEventListener('change', (event) => {
    state.admin.tickets.priority = event.target.value;
    state.admin.tickets.page = 1;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-assigned-select').addEventListener('change', (event) => {
    state.admin.tickets.assignedTo = event.target.value;
    state.admin.tickets.page = 1;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-sort-select').addEventListener('change', (event) => {
    state.admin.tickets.sort = event.target.value;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-order-btn').addEventListener('click', () => {
    state.admin.tickets.order = state.admin.tickets.order === 'asc' ? 'desc' : 'asc';
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-prev-btn')?.addEventListener('click', () => {
    if (state.admin.tickets.page <= 1) return;
    state.admin.tickets.page -= 1;
    loadAdminTickets(state, render);
  });
  document.querySelector('#admin-tickets-next-btn')?.addEventListener('click', () => {
    state.admin.tickets.page += 1;
    loadAdminTickets(state, render);
  });
  document.querySelectorAll('.admin-page-number-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.admin.tickets.page = Number(btn.dataset.page);
      loadAdminTickets(state, render);
    });
  });
  document.querySelectorAll('.admin-ticket-row[data-ticket-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const ticketId = Number(row.dataset.ticketId);
      state.admin.section = 'ticketDetail';
      state.admin.tickets.selectedTicketId = ticketId;
      render();
      loadAdminTicketDetail(state, render, ticketId);
    });
  });
}

export async function loadAdminTicketDetail(state, render, ticketId) {
  state.admin.tickets.selectedLoading = true;
  render();
  try {
    const payload = await api(`/api/admin/support/tickets/${ticketId}`);
    state.admin.tickets.selectedTicket = payload.ticket;
    state.admin.tickets.selectedOwner = payload.owner;
    state.admin.tickets.selectedMessages = payload.messages.filter((message) => !message.is_internal);
    state.admin.tickets.selectedNotes = payload.messages.filter((message) => message.is_internal);
  } catch (error) {
    showToast(error.message || 'Could not load this ticket.', { type: 'error' });
    state.admin.section = 'tickets';
  } finally {
    state.admin.tickets.selectedLoading = false;
    render();
  }
}

async function updateAdminTicket(state, render, ticketId, body) {
  try {
    const payload = await api(`/api/admin/support/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify(body) });
    state.admin.tickets.selectedTicket = payload.ticket;
    render();
    showToast('Ticket updated.');
  } catch (error) {
    showToast(error.message || 'Could not update the ticket.', { type: 'error' });
    render();
  }
}

export function attachAdminTicketDetailListeners(state, render) {
  scrollThreadToBottom();
  const ticketId = state.admin.tickets.selectedTicketId;

  document.querySelector('[data-breadcrumb-id="admin-ticket-back-btn"]').addEventListener('click', () => {
    state.admin.section = 'tickets';
    render();
    loadAdminTickets(state, render);
  });
  attachAttachmentDownloadListeners();
  attachReplyForm({
    render,
    onSubmit: async (formData) => {
      const payload = await api(`/api/admin/support/tickets/${ticketId}/messages`, { method: 'POST', body: formData });
      state.admin.tickets.selectedTicket = payload.ticket;
      state.admin.tickets.selectedMessages = [...state.admin.tickets.selectedMessages, payload.message];
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
