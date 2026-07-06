// Injects Media/Events tabs into the family-chart library's built-in edit
// panel, via the library's setOnFormCreation hook (src/core/edit.ts) - this
// lets the tabs live alongside the native Details form without modifying
// src/. onFormCreation fires on every form reload (edit/cancel/add-relative/
// etc all call it again), and the library replaces `cont`'s innerHTML with a
// fresh <form> each time, so this function re-appends the tab UI fresh on
// every call rather than assuming its previous DOM survives.
//
// Also exports openReadOnlyPersonModal for viewers, who never get the
// library's editTree() panel at all (main.js gates it on canEdit) - they get
// a standalone modal with just the Media/Events tabs, no upload/tag/edit
// controls.
import { showModal, showToast } from './ui.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { searchMembers } from './memberSearch.js';
import * as mediaApi from './mediaApi.js';
import { openMediaLightbox } from './mediaLightbox.js';
import { hydrateMediaSources, mediaThumbHtml } from './mediaSrc.js';

// Active tab per person, so switching fields inside "Details" (which
// triggers reload()) doesn't silently bounce the user back to "Details".
const activeTabByPersonId = new Map();

function renderMediaGrid(items, { readOnly }) {
  if (!items.length) {
    return `<p class="muted">No photos, videos, or documents yet${readOnly ? '' : ' — upload one below'}.</p>`;
  }
  return `
    <div class="media-grid">
      ${items
        .map(
          (item) => `
        <button type="button" class="media-grid-item" data-media-id="${item.id}">
          ${mediaThumbHtml(item)}
        </button>`
        )
        .join('')}
    </div>
  `;
}

function renderEventsList(events) {
  if (!events.length) return '<p class="muted">No events recorded yet.</p>';
  return `
    <ul class="person-events-list">
      ${events
        .map(
          (ev) => `
        <li class="person-event-row">
          <span class="person-event-date">${ev.event_date ? escapeHtml(ev.event_date) : 'Undated'}</span>
          <span class="person-event-title">${escapeHtml(ev.title)}</span>
          ${ev.location ? `<span class="person-event-location muted">${escapeHtml(ev.location)}</span>` : ''}
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function panelBody({ tab, media, events, readOnly }) {
  return `
    <div class="person-tab-bar" role="tablist">
      <button type="button" class="person-tab-btn ${tab === 'media' ? 'active' : ''}" data-tab="media" role="tab">Media</button>
      <button type="button" class="person-tab-btn ${tab === 'events' ? 'active' : ''}" data-tab="events" role="tab">Events</button>
    </div>
    <div class="person-tab-panel">
      ${
        tab === 'media'
          ? `
        ${renderMediaGrid(media, { readOnly })}
        ${
          readOnly
            ? ''
            : `
          <label class="person-media-dropzone" for="person-media-upload-input">
            ${icon('upload')}<span>Upload photo, video, or document</span>
          </label>
          <input type="file" id="person-media-upload-input" hidden accept="image/*,video/*,.pdf,.doc,.docx" />
        `
        }
      `
          : renderEventsList(events)
      }
    </div>
  `;
}

function kindForFile(file) {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

// Shared by both the embedded (inside editTree panel) and standalone
// (read-only viewer modal) cases - `root` is the DOM node to render into,
// `onRerender` re-invokes this function with fresh data after a mutation.
function mountPersonTabs({ root, datum, api, treeId, memberIndex, readOnly }) {
  const personId = datum.id;
  const tab = activeTabByPersonId.get(personId) || 'media';

  const state = { media: [], events: [] };

  const render = () => {
    root.innerHTML = panelBody({ tab: activeTabByPersonId.get(personId) || 'media', media: state.media, events: state.events, readOnly });
    bindListeners();
    hydrateMediaSources(root, new Map(state.media.map((m) => [m.id, m])));
  };

  function bindListeners() {
    root.querySelectorAll('.person-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTabByPersonId.set(personId, btn.dataset.tab);
        render();
      });
    });

    root.querySelectorAll('.media-grid-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = state.media.find((m) => m.id === Number(btn.dataset.mediaId));
        if (!item) return;
        openMediaLightbox({
          api,
          treeId,
          media: item,
          memberIndex,
          readOnly,
          onDeleted: (mediaId) => {
            state.media = state.media.filter((m) => m.id !== mediaId);
            render();
          },
          onUpdated: (updatedMedia) => {
            state.media = state.media.map((m) => (m.id === updatedMedia.id ? updatedMedia : m));
            render();
          },
        });
      });
    });

    const uploadInput = root.querySelector('#person-media-upload-input');
    uploadInput?.addEventListener('change', async () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      try {
        const { media } = await mediaApi.uploadMedia(api, treeId, { file, kind: kindForFile(file), title: file.name });
        await mediaApi.tagMember(api, treeId, media.id, { memberId: personId });
        state.media = [media, ...state.media];
        render();
        showToast('Uploaded and tagged');
      } catch (error) {
        showToast(error.message || 'Upload failed', { type: 'error' });
      }
    });
  }

  render();

  Promise.all([
    mediaApi.listMedia(api, treeId, { memberId: personId }).catch(() => ({ media: [] })),
    mediaApi.listEvents(api, treeId, { memberId: personId }).catch(() => ({ events: [] })),
  ]).then(([mediaRes, eventsRes]) => {
    state.media = mediaRes.media || [];
    state.events = eventsRes.events || [];
    render();
  });
}

// Called from setOnFormCreation({ cont, form_creator }) in main.js's
// renderChart(). Appends the tab UI as a sibling of the library's <form>,
// inside the same container the library just repopulated.
export function attachPersonMediaTabs({ cont, datum, api, treeId, memberIndex }) {
  if (!datum?.id) return;

  let panelRoot = cont.querySelector('.person-media-tabs-root');
  if (!panelRoot) {
    panelRoot = document.createElement('div');
    panelRoot.className = 'person-media-tabs-root';
    cont.appendChild(panelRoot);
  }

  mountPersonTabs({ root: panelRoot, datum, api, treeId, memberIndex, readOnly: false });
}

// Standalone read-only modal for viewers, who never open the library's
// editTree() panel (main.js gates it on canEdit).
export function openReadOnlyPersonModal({ api, treeId, datum, memberIndex }) {
  const name = [datum.data?.['first name'], datum.data?.['last name']].filter(Boolean).join(' ') || 'Family member';
  const modal = showModal({
    bodyHtml: `
      <button type="button" class="icon-btn modal-close" id="person-modal-close-btn" aria-label="Close">${icon('close')}</button>
      <h3>${escapeHtml(name)}</h3>
      <div class="person-media-tabs-root"></div>
    `,
    className: 'modal-person-media',
  });
  modal.root.querySelector('#person-modal-close-btn').addEventListener('click', () => modal.close());
  mountPersonTabs({ root: modal.root.querySelector('.person-media-tabs-root'), datum, api, treeId, memberIndex, readOnly: true });
  return modal;
}

export { searchMembers };
