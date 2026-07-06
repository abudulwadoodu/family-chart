// Tree-wide "Timeline": all events for the open tree, grouped by year.
// Rendered as a full dashboardView page (see main.js's renderDashboard/
// isTimelineView), following the same state-on-a-slice + renderXPageContent/
// attachXPageListeners(state, render) shape as mediaLibraryPanel.js.
import { showModal, showToast } from './ui.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { searchMembers } from './memberSearch.js';
import * as mediaApi from './mediaApi.js';
import { hydrateMediaSources, mediaThumbHtml } from './mediaSrc.js';
import { openMediaLightbox } from './mediaLightbox.js';

function memberLabel(memberIndex, memberId) {
  return memberIndex.find((m) => m.id === memberId)?.label || memberId;
}

function groupByYear(events) {
  const groups = new Map();
  for (const ev of events) {
    const year = ev.event_date ? ev.event_date.slice(0, 4) : 'Undated';
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(ev);
  }
  return [...groups.entries()];
}

function eventForm(pageState) {
  return `
    <div class="timeline-new-event-form">
      <input type="text" id="timeline-event-title" placeholder="Event title" value="${escapeHtml(pageState.newEvent.title)}" maxlength="200" />
      <input type="date" id="timeline-event-date" value="${escapeHtml(pageState.newEvent.eventDate)}" />
      <input type="text" id="timeline-event-location" placeholder="Location (optional)" value="${escapeHtml(pageState.newEvent.location)}" />
      <div class="modal-actions row">
        <button type="button" class="btn-secondary" id="timeline-event-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-primary" id="timeline-event-save-btn" ${pageState.newEvent.title.trim() ? '' : 'disabled'}>Create Event</button>
      </div>
    </div>
  `;
}

function eventRow(ev, memberIndex) {
  return `
    <li class="timeline-event-row" data-event-id="${ev.id}">
      <div class="timeline-event-date">${ev.event_date ? escapeHtml(ev.event_date) : 'Undated'}</div>
      <div class="timeline-event-body">
        <p class="timeline-event-title">${escapeHtml(ev.title)}</p>
        ${ev.location ? `<p class="timeline-event-location muted">${escapeHtml(ev.location)}</p>` : ''}
      </div>
    </li>
  `;
}

function eventEditForm({ title, eventDate, location, description }) {
  return `
    <div class="lightbox-edit-form">
      <label>Title
        <input type="text" id="timeline-edit-title" value="${escapeHtml(title)}" maxlength="200" placeholder="Event title" />
      </label>
      <label>Date
        <input type="date" id="timeline-edit-date" value="${escapeHtml(eventDate)}" />
      </label>
      <label>Location
        <input type="text" id="timeline-edit-location" value="${escapeHtml(location)}" placeholder="Location (optional)" />
      </label>
      <label>Description
        <textarea id="timeline-edit-description" maxlength="2000" placeholder="Add a description&hellip;" rows="3">${escapeHtml(description)}</textarea>
      </label>
      <div class="modal-actions row">
        <button type="button" class="btn-secondary" id="timeline-edit-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-primary" id="timeline-edit-save-btn">Save</button>
      </div>
    </div>
  `;
}

function eventDetail({ event, participants, media, memberIndex, readOnly, memberQuery, memberResults, editing, editDraft }) {
  return `
    <button type="button" id="timeline-detail-back-btn" class="breadcrumb-link">&larr; Back to Timeline</button>
    ${
      editing
        ? eventEditForm(editDraft)
        : `
      <div class="lightbox-title-row">
        <h1 class="page-title">${escapeHtml(event.title)}</h1>
        ${readOnly ? '' : `<button type="button" class="icon-btn" id="timeline-edit-btn" aria-label="Edit event">${icon('pencil')}</button>`}
      </div>
      <p class="page-subtitle">
        ${event.event_date ? escapeHtml(event.event_date) : 'Undated'}${event.location ? ` &middot; ${escapeHtml(event.location)}` : ''}
      </p>
      ${event.description ? `<p class="modal-message">${escapeHtml(event.description)}</p>` : ''}
    `
    }

    ${
      editing
        ? ''
        : `
    <p class="lightbox-tags-title">Participants</p>
    <ul class="lightbox-tag-list">
      ${
        participants.length
          ? participants
              .map(
                (p) => `
            <li class="lightbox-tag-chip" data-member-id="${escapeHtml(p.member_id)}">
              <span>${escapeHtml(memberLabel(memberIndex, p.member_id))}</span>
              ${readOnly ? '' : `<button type="button" class="icon-btn timeline-remove-participant-btn" data-member-id="${escapeHtml(p.member_id)}" aria-label="Remove">${icon('close')}</button>`}
            </li>`
              )
              .join('')
          : '<li class="muted">No participants added yet.</li>'
      }
    </ul>
    ${
      readOnly
        ? ''
        : `
      <div class="lightbox-tag-add">
        <input type="text" id="timeline-participant-input" placeholder="Add a participant..." value="${escapeHtml(memberQuery)}" autocomplete="off" />
        ${
          memberResults.length
            ? `<ul class="lightbox-tag-suggestions">
                 ${memberResults.map((r) => `<li data-member-id="${escapeHtml(r.id)}">${escapeHtml(r.label)}</li>`).join('')}
               </ul>`
            : ''
        }
      </div>`
    }

    <div class="timeline-media-header">
      <p class="lightbox-tags-title">Media</p>
      ${readOnly ? '' : `<button type="button" class="btn btn-secondary" id="timeline-attach-media-btn">${icon('image')}<span>Attach Media</span></button>`}
    </div>
    ${
      media.length
        ? `<div class="media-grid">
             ${media
               .map(
                 (item) => `
               <button type="button" class="media-grid-item" data-media-id="${item.id}">
                 ${mediaThumbHtml(item)}
               </button>`
               )
               .join('')}
           </div>`
        : '<p class="muted">No media attached.</p>'
    }

    ${
      readOnly
        ? ''
        : `<div class="modal-actions row">
             <button type="button" class="btn-danger" id="timeline-delete-event-btn">${icon('trash')}<span>Delete Event</span></button>
           </div>`
    }
    `
    }
  `;
}

function kindForFile(file) {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

function mediaPickerBody(items) {
  return `
    <button type="button" class="icon-btn modal-close" id="timeline-media-picker-close-btn" aria-label="Close">${icon('close')}</button>
    <h3>Attach Media</h3>
    <label class="btn btn-primary timeline-media-picker-upload-label" for="timeline-media-picker-upload-input">${icon('upload')}<span>Upload New</span></label>
    <input type="file" id="timeline-media-picker-upload-input" hidden accept="image/*,video/*,.pdf,.doc,.docx" />
    ${
      items.length
        ? `<div class="media-grid">
             ${items
               .map(
                 (item) => `
               <button type="button" class="media-grid-item" data-media-id="${item.id}">
                 ${mediaThumbHtml(item)}
               </button>`
               )
               .join('')}
           </div>`
        : '<p class="muted">No existing media to attach yet - upload one above.</p>'
    }
  `;
}

// Small transient picker modal (not a page - it's a one-shot "pick one" flow
// like the album-cover pattern), listing tree media not yet attached to this
// event, plus an upload-new-file shortcut. Reuses openMediaLightbox's
// data-media-src/hydrateMediaSources convention for authenticated thumbnails.
function openMediaPicker({ api, treeId, attachedMediaIds, onAttach }) {
  const modal = showModal({ bodyHtml: '<p>Loading&hellip;</p>', className: 'modal-media-lightbox' });

  function renderAvailable(available) {
    modal.setBody(mediaPickerBody(available));
    modal.root.querySelector('#timeline-media-picker-close-btn').addEventListener('click', () => modal.close());
    modal.root.querySelectorAll('.media-grid-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = available.find((m) => m.id === Number(btn.dataset.mediaId));
        if (!item) return;
        onAttach(item);
        modal.close();
      });
    });
    const uploadInput = modal.root.querySelector('#timeline-media-picker-upload-input');
    uploadInput?.addEventListener('change', async () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      try {
        const { media } = await mediaApi.uploadMedia(api, treeId, { file, kind: kindForFile(file), title: file.name });
        onAttach(media);
        modal.close();
      } catch (error) {
        showToast(error.message || 'Upload failed', { type: 'error' });
      }
    });
    hydrateMediaSources(modal.root, new Map(available.map((m) => [m.id, m])));
  }

  mediaApi
    .listMedia(api, treeId)
    .then(({ media }) => {
      const attachedIds = new Set(attachedMediaIds);
      renderAvailable(media.filter((m) => !attachedIds.has(m.id)));
    })
    .catch((error) => {
      showToast(error.message || 'Could not load media', { type: 'error' });
      modal.close();
    });

  return modal;
}

function listBody(pageState, { memberIndex, readOnly }) {
  const groups = groupByYear(pageState.events);
  return `
    <button type="button" id="timeline-back-btn" class="breadcrumb-link">&larr; Back to Tree</button>
    <header class="page-header">
      <h1 class="page-title">Timeline</h1>
      <p class="page-subtitle">Events for this tree</p>
    </header>
    ${
      !pageState.loaded
        ? '<p class="muted">Loading&hellip;</p>'
        : `
    ${
      readOnly
        ? ''
        : pageState.creating
          ? eventForm(pageState)
          : `<button type="button" class="btn btn-primary" id="timeline-new-event-btn">${icon('plus')}<span>Create Event</span></button>`
    }
    ${
      groups.length
        ? groups
            .map(
              ([year, events]) => `
          <div class="timeline-year-group">
            <p class="timeline-year-label">${escapeHtml(year)}</p>
            <ul class="timeline-event-list">${events.map((ev) => eventRow(ev, memberIndex)).join('')}</ul>
          </div>`
            )
            .join('')
        : '<p class="muted">No events yet.</p>'
    }
    `
    }
  `;
}

export function createTimelinePageState() {
  return {
    loaded: false,
    view: 'list',
    events: [],
    creating: false,
    newEvent: { title: '', eventDate: '', location: '' },
    detail: null,
    participants: [],
    media: [],
    memberQuery: '',
    memberResults: [],
    editing: false,
    editDraft: { title: '', eventDate: '', location: '', description: '' },
  };
}

export function renderTimelinePageContent(pageState, { memberIndex, readOnly }) {
  return `
    <div class="timeline-page">
      ${
        pageState.view === 'detail' && pageState.detail
          ? eventDetail({
              event: pageState.detail,
              participants: pageState.participants,
              media: pageState.media,
              memberIndex,
              readOnly,
              memberQuery: pageState.memberQuery,
              memberResults: pageState.memberResults,
              editing: pageState.editing,
              editDraft: pageState.editDraft,
            })
          : listBody(pageState, { memberIndex, readOnly })
      }
    </div>
  `;
}

export async function loadTimelinePage(pageState, { api, treeId }, rerender) {
  try {
    const { events } = await mediaApi.listEvents(api, treeId);
    pageState.events = events;
  } catch (error) {
    showToast(error.message || 'Could not load timeline', { type: 'error' });
  } finally {
    pageState.loaded = true;
    rerender();
  }
}

async function openDetail(pageState, { api, treeId }, eventId, rerender) {
  try {
    const { event, participants, media } = await mediaApi.getEvent(api, treeId, eventId);
    pageState.view = 'detail';
    pageState.detail = event;
    pageState.participants = participants;
    pageState.media = media;
    pageState.memberQuery = '';
    pageState.memberResults = [];
    rerender();
  } catch (error) {
    showToast(error.message || 'Could not load event', { type: 'error' });
  }
}

// `onBack` navigates back to the tree viewer; `rerender` re-invokes the
// page's own render (main.js's render()), which calls renderTimelinePageContent
// again with the same pageState and then re-runs this attach function.
export function attachTimelinePageListeners(pageState, { api, treeId, memberIndex, readOnly = false }, rerender, onBack) {
  const root = document.querySelector('.timeline-page');
  if (!root) return;

  if (pageState.view === 'detail' && pageState.detail) {
    hydrateMediaSources(root, new Map(pageState.media.map((m) => [m.id, m])));

    root.querySelector('#timeline-detail-back-btn').addEventListener('click', () => {
      pageState.view = 'list';
      rerender();
    });

    root.querySelectorAll('.media-grid-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = pageState.media.find((m) => m.id === Number(btn.dataset.mediaId));
        if (!item) return;
        openMediaLightbox({
          api,
          treeId,
          media: item,
          memberIndex,
          readOnly,
          context: { type: 'event', id: pageState.detail.id, name: pageState.detail.title },
          onDeleted: (mediaId) => {
            pageState.media = pageState.media.filter((m) => m.id !== mediaId);
            rerender();
          },
          onRemovedFromContext: (mediaId) => {
            pageState.media = pageState.media.filter((m) => m.id !== mediaId);
            rerender();
          },
          onUpdated: (updatedMedia) => {
            pageState.media = pageState.media.map((m) => (m.id === updatedMedia.id ? updatedMedia : m));
            rerender();
          },
        });
      });
    });

    if (readOnly) return;

    if (pageState.editing) {
      const bindCaretPreservingInput = (id, draftKey) => {
        const el = root.querySelector(`#${id}`);
        el?.addEventListener('input', () => {
          pageState.editDraft[draftKey] = el.value;
          const caret = el.selectionStart;
          rerender();
          const freshEl = document.querySelector(`#${id}`);
          freshEl?.focus();
          freshEl?.setSelectionRange(caret, caret);
        });
      };
      bindCaretPreservingInput('timeline-edit-title', 'title');
      bindCaretPreservingInput('timeline-edit-location', 'location');
      bindCaretPreservingInput('timeline-edit-description', 'description');
      root.querySelector('#timeline-edit-date')?.addEventListener('input', (event) => {
        pageState.editDraft.eventDate = event.target.value;
      });

      root.querySelector('#timeline-edit-cancel-btn').addEventListener('click', () => {
        pageState.editing = false;
        rerender();
      });

      root.querySelector('#timeline-edit-save-btn').addEventListener('click', async () => {
        try {
          const { event } = await mediaApi.updateEvent(api, treeId, pageState.detail.id, {
            title: pageState.editDraft.title.trim(),
            eventDate: pageState.editDraft.eventDate || null,
            location: pageState.editDraft.location.trim() || null,
            description: pageState.editDraft.description.trim() || null,
          });
          pageState.detail = event;
          pageState.events = pageState.events.map((e) => (e.id === event.id ? event : e));
          pageState.editing = false;
          rerender();
          showToast('Event updated');
        } catch (error) {
          showToast(error.message || 'Could not update event', { type: 'error' });
        }
      });
      return;
    }

    root.querySelector('#timeline-edit-btn')?.addEventListener('click', () => {
      pageState.editDraft = {
        title: pageState.detail.title || '',
        eventDate: pageState.detail.event_date || '',
        location: pageState.detail.location || '',
        description: pageState.detail.description || '',
      };
      pageState.editing = true;
      rerender();
    });

    root.querySelectorAll('.timeline-remove-participant-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await mediaApi.removeParticipant(api, treeId, pageState.detail.id, btn.dataset.memberId);
          pageState.participants = pageState.participants.filter((p) => p.member_id !== btn.dataset.memberId);
          rerender();
        } catch (error) {
          showToast(error.message || 'Could not remove participant', { type: 'error' });
        }
      });
    });

    const input = root.querySelector('#timeline-participant-input');
    input?.addEventListener('input', () => {
      pageState.memberQuery = input.value;
      pageState.memberResults = pageState.memberQuery.trim() ? searchMembers(memberIndex, pageState.memberQuery, 8) : [];
      const caret = input.selectionStart;
      rerender();
      const freshInput = document.querySelector('#timeline-participant-input');
      freshInput?.focus();
      freshInput?.setSelectionRange(caret, caret);
    });

    root.querySelectorAll('.lightbox-tag-suggestions li').forEach((li) => {
      li.addEventListener('click', async () => {
        try {
          await mediaApi.addParticipant(api, treeId, pageState.detail.id, { memberId: li.dataset.memberId });
          pageState.participants = [...pageState.participants, { member_id: li.dataset.memberId }];
          pageState.memberQuery = '';
          pageState.memberResults = [];
          rerender();
        } catch (error) {
          showToast(error.message || 'Could not add participant', { type: 'error' });
        }
      });
    });

    root.querySelector('#timeline-attach-media-btn')?.addEventListener('click', () => {
      openMediaPicker({
        api,
        treeId,
        attachedMediaIds: pageState.media.map((m) => m.id),
        onAttach: async (item) => {
          try {
            await mediaApi.attachMediaToEvent(api, treeId, pageState.detail.id, item.id);
            pageState.media = [...pageState.media, item];
            rerender();
            showToast('Media attached');
          } catch (error) {
            showToast(error.message || 'Could not attach media', { type: 'error' });
          }
        },
      });
    });

    root.querySelector('#timeline-delete-event-btn')?.addEventListener('click', async () => {
      try {
        await mediaApi.deleteEvent(api, treeId, pageState.detail.id);
        pageState.events = pageState.events.filter((e) => e.id !== pageState.detail.id);
        pageState.view = 'list';
        rerender();
        showToast('Event deleted');
      } catch (error) {
        showToast(error.message || 'Could not delete event', { type: 'error' });
      }
    });
    return;
  }

  root.querySelector('#timeline-back-btn').addEventListener('click', onBack);

  root.querySelectorAll('.timeline-event-row').forEach((row) => {
    row.addEventListener('click', () => openDetail(pageState, { api, treeId }, Number(row.dataset.eventId), rerender));
  });

  if (readOnly) return;

  root.querySelector('#timeline-new-event-btn')?.addEventListener('click', () => {
    pageState.creating = true;
    rerender();
  });

  root.querySelector('#timeline-event-cancel-btn')?.addEventListener('click', () => {
    pageState.creating = false;
    pageState.newEvent = { title: '', eventDate: '', location: '' };
    rerender();
  });

  ['title', 'date', 'location'].forEach((field) => {
    const el = root.querySelector(`#timeline-event-${field === 'date' ? 'date' : field}`);
    el?.addEventListener('input', () => {
      pageState.newEvent[field === 'date' ? 'eventDate' : field] = el.value;
      const caret = el.selectionStart;
      rerender();
      const freshEl = document.querySelector(`#timeline-event-${field === 'date' ? 'date' : field}`);
      freshEl?.focus();
      freshEl?.setSelectionRange(caret, caret);
    });
  });

  root.querySelector('#timeline-event-save-btn')?.addEventListener('click', async () => {
    try {
      const { event } = await mediaApi.createEvent(api, treeId, {
        title: pageState.newEvent.title.trim(),
        eventDate: pageState.newEvent.eventDate || null,
        location: pageState.newEvent.location.trim() || null,
      });
      pageState.events = [event, ...pageState.events];
      pageState.creating = false;
      pageState.newEvent = { title: '', eventDate: '', location: '' };
      rerender();
      showToast('Event created');
    } catch (error) {
      showToast(error.message || 'Could not create event', { type: 'error' });
    }
  });
}
