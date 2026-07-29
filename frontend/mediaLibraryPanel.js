// Tree-wide "Media Library": every photo/video/document for the open tree,
// filterable by kind, plus albums. Rendered as a full dashboardView page (see
// main.js's renderDashboard/isMediaLibraryView), following the same
// state-on-a-slice + renderXPageContent/attachXPageListeners(state, render)
// shape as support/logic.js's My Support Tickets page.
import { showToast, showConfirmDialog } from './ui.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import * as mediaApi from './mediaApi.js';
import { openMediaLightbox, openMediaStubModal } from './mediaLightbox.js';
import { hydrateMediaSources, mediaThumbHtml } from './mediaSrc.js';
import {
  createVisibilityPickerState,
  loadCollaborators,
  renderVisibilityPickerHtml,
  attachVisibilityPickerListeners,
  getVisibilityPayload,
} from './visibilityPicker.js';

const KIND_FILTERS = [
  { value: '', label: 'All' },
  { value: 'photo', label: 'Photos' },
  { value: 'video', label: 'Videos' },
  { value: 'document', label: 'Documents' },
];

function albumsSidebar(albums, activeAlbumId, readOnly) {
  return `
    <ul class="media-library-albums">
      <li class="media-library-album-row ${activeAlbumId === null ? 'active' : ''}" data-album-id="">All Media</li>
      ${albums
        .map(
          (album) => `
        <li class="media-library-album-row ${activeAlbumId === album.id ? 'active' : ''}" data-album-id="${album.id}">
          <span class="media-library-album-name">${escapeHtml(album.name)}</span>
          ${
            readOnly
              ? ''
              : `
            <button type="button" class="icon-btn media-library-album-rename-btn" data-album-id="${album.id}" aria-label="Rename album">${icon('pencil')}</button>
            <button type="button" class="icon-btn media-library-album-delete-btn" data-album-id="${album.id}" aria-label="Delete album">${icon('trash')}</button>
          `
          }
        </li>`
        )
        .join('')}
    </ul>
  `;
}

export function createMediaLibraryPageState() {
  return {
    loaded: false,
    kindFilter: '',
    mineOnly: false,
    albums: [],
    activeAlbumId: null,
    media: [],
    pendingFile: null,
    visibilityPicker: createVisibilityPickerState(),
  };
}

// The kind-filter chips + New Album/Upload buttons render inside main.js's
// compact Row 2 header (renderAppHeader's left/right slots), not inside
// .media-library-page itself - see renderMediaLibraryPageContent's own
// comment below. Listeners for this block are attached from `document` (not
// the .media-library-page root) in attachMediaLibraryPageListeners, since it
// lives outside that container.
export function renderMediaLibraryFilterPills(pageState) {
  const { kindFilter, mineOnly } = pageState;
  return `
    <div class="toolbar-pills">
      ${KIND_FILTERS.map(
        (f) =>
          `<button type="button" class="chip ${kindFilter === f.value ? 'chip-active' : ''}" data-kind="${f.value}">${f.label}</button>`
      ).join('')}
      <button type="button" class="chip ${mineOnly ? 'chip-active' : ''}" id="media-library-mine-toggle">My uploads</button>
    </div>
  `;
}

export function renderMediaLibraryActions(pageState, { readOnly }) {
  if (readOnly) return '';
  return `
    <div class="toolbar-actions">
      <button type="button" class="btn btn-secondary media-library-new-album-btn">${icon('folderPlus')}<span>New Album</span></button>
      <label class="btn btn-primary media-library-upload-label" for="media-library-upload-input">${icon('upload')}<span>Upload</span></label>
      <input type="file" id="media-library-upload-input" hidden accept="image/*,video/*,.pdf,.doc,.docx" />
    </div>
  `;
}

// The breadcrumb/title-row/segmented-tabs/filter-pills/actions chrome around
// this content is rendered once by main.js's renderDashboard (see
// renderAppHeader in components.js and renderMediaLibraryFilterPills/
// renderMediaLibraryActions above) and shared with the Tree View/Timeline
// pages - this only ever renders what's specific to Media Library's own body
// (albums sidebar + media grid).
export function renderMediaLibraryPageContent(pageState, { readOnly, currentUserId }) {
  const { mineOnly, albums, activeAlbumId, loaded, pendingFile } = pageState;
  const media = mineOnly ? pageState.media.filter((m) => m.uploaded_by === currentUserId) : pageState.media;

  return `
    <div class="media-library-page">
      ${
        !loaded
          ? '<p class="muted">Loading&hellip;</p>'
          : `
      <div class="media-library-layout">
        <div class="media-library-sidebar">
          ${albumsSidebar(albums, activeAlbumId, readOnly)}
        </div>

        <div class="media-library-main">
          ${
            pendingFile
              ? `<div class="media-library-pending-upload">
                   <p class="modal-message">Uploading <strong>${escapeHtml(pendingFile.name)}</strong></p>
                   ${renderVisibilityPickerHtml(pageState.visibilityPicker, { idPrefix: 'media-library-upload' })}
                   <div class="modal-actions row">
                     <button type="button" class="btn-secondary" id="media-library-pending-cancel-btn">Cancel</button>
                     <button type="button" class="btn btn-primary" id="media-library-pending-confirm-btn">Upload</button>
                   </div>
                 </div>`
              : ''
          }

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
              : '<p class="muted">No media found.</p>'
          }
        </div>
      </div>
      `
      }
    </div>
  `;
}

function kindForFile(file) {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

export async function loadMediaLibraryPage(pageState, { api, treeId }, rerender) {
  try {
    const [albumsRes, mediaRes] = await Promise.all([
      mediaApi.listAlbums(api, treeId).catch(() => ({ albums: [] })),
      mediaApi.listMedia(api, treeId).catch(() => ({ media: [] })),
    ]);
    pageState.albums = albumsRes.albums || [];
    pageState.media = mediaRes.media || [];
  } finally {
    pageState.loaded = true;
    rerender();
  }
}

async function reloadMedia(pageState, { api, treeId }, rerender) {
  if (pageState.activeAlbumId) {
    const { media } = await mediaApi.getAlbum(api, treeId, pageState.activeAlbumId);
    pageState.media = pageState.kindFilter ? media.filter((m) => m.kind === pageState.kindFilter) : media;
  } else {
    const { media } = await mediaApi.listMedia(api, treeId, { kind: pageState.kindFilter || undefined });
    pageState.media = media;
  }
  rerender();
}

// The shared header's breadcrumb/nav (main.js's attachTreeViewerHeaderListeners)
// is wired separately and covers "My Trees"/tree-name navigation - this only
// wires what's specific to Media Library itself. `rerender` re-invokes the
// page's own render (main.js's render()), which calls
// renderMediaLibraryPageContent again with the same pageState and then
// re-runs this attach function.
export function attachMediaLibraryPageListeners(pageState, { api, treeId, memberIndex, memberById, currentUserId, readOnly = false }, rerender) {
  const root = document.querySelector('.media-library-page');
  if (!root) return;

  hydrateMediaSources(root, new Map(pageState.media.map((m) => [m.id, m])));

  // The kind-filter chips/My uploads toggle/New Album/Upload controls render
  // in main.js's compact Row 2 header (.toolbar-pills/.toolbar-actions) -
  // outside .media-library-page - so they're queried from `document` rather
  // than `root`. reloadMedia's server round-trip means the grid itself can't
  // update until it resolves, but the clicked chip flips to .chip-active
  // synchronously (before the await) so the sub-toolbar itself never waits on
  // the network to reflect the click.
  document.querySelectorAll('[data-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.kind === pageState.kindFilter) return;
      pageState.kindFilter = btn.dataset.kind;
      document.querySelectorAll('[data-kind]').forEach((chip) => chip.classList.toggle('chip-active', chip === btn));
      reloadMedia(pageState, { api, treeId }, rerender).catch((error) =>
        showToast(error.message || 'Could not load media', { type: 'error' })
      );
    });
  });

  document.querySelector('#media-library-mine-toggle')?.addEventListener('click', () => {
    pageState.mineOnly = !pageState.mineOnly;
    rerender();
  });

  attachVisibilityPickerListeners(root, pageState.visibilityPicker, rerender);

  root.querySelectorAll('.media-library-album-row').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('.media-library-album-rename-btn, .media-library-album-delete-btn')) return;
      pageState.activeAlbumId = row.dataset.albumId ? Number(row.dataset.albumId) : null;
      reloadMedia(pageState, { api, treeId }, rerender).catch((error) =>
        showToast(error.message || 'Could not load album', { type: 'error' })
      );
    });
  });

  root.querySelectorAll('.media-library-album-rename-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const albumId = Number(btn.dataset.albumId);
      const album = pageState.albums.find((a) => a.id === albumId);
      if (!album) return;
      const name = window.prompt('Album name', album.name);
      if (!name?.trim() || name.trim() === album.name) return;
      try {
        const { album: updated } = await mediaApi.updateAlbum(api, treeId, albumId, { name: name.trim(), description: album.description });
        pageState.albums = pageState.albums.map((a) => (a.id === albumId ? updated : a));
        rerender();
      } catch (error) {
        showToast(error.message || 'Could not rename album', { type: 'error' });
      }
    });
  });

  root.querySelectorAll('.media-library-album-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const albumId = Number(btn.dataset.albumId);
      const album = pageState.albums.find((a) => a.id === albumId);
      if (!album) return;
      showConfirmDialog({
        title: 'Delete Album',
        message: `Are you sure you want to delete "${album.name}"? The media inside stays in the library - only the album is removed.`,
        confirmLabel: 'Delete',
        onConfirm: async () => {
          try {
            await mediaApi.deleteAlbum(api, treeId, albumId);
            pageState.albums = pageState.albums.filter((a) => a.id !== albumId);
            if (pageState.activeAlbumId === albumId) {
              pageState.activeAlbumId = null;
              await reloadMedia(pageState, { api, treeId }, rerender);
            } else {
              rerender();
            }
            showToast('Album deleted');
          } catch (error) {
            showToast(error.message || 'Could not delete album', { type: 'error' });
            throw error;
          }
        },
      });
    });
  });

  root.querySelectorAll('.media-grid-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = pageState.media.find((m) => m.id === Number(btn.dataset.mediaId));
      if (!item) return;
      if (item.access === 'stub') {
        openMediaStubModal({
          api,
          treeId,
          media: item,
          onDeleted: (mediaId) => {
            pageState.media = pageState.media.filter((m) => m.id !== mediaId);
            rerender();
          },
        });
        return;
      }
      const activeAlbum = pageState.activeAlbumId ? pageState.albums.find((a) => a.id === pageState.activeAlbumId) : null;
      openMediaLightbox({
        api,
        treeId,
        media: item,
        memberIndex,
        memberById,
        currentUserId,
        readOnly,
        context: activeAlbum ? { type: 'album', id: activeAlbum.id, name: activeAlbum.name } : null,
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

  document.querySelector('.media-library-new-album-btn')?.addEventListener('click', async () => {
    const name = window.prompt('Album name');
    if (!name?.trim()) return;
    try {
      const { album } = await mediaApi.createAlbum(api, treeId, { name: name.trim() });
      pageState.albums = [album, ...pageState.albums];
      rerender();
    } catch (error) {
      showToast(error.message || 'Could not create album', { type: 'error' });
    }
  });

  const uploadInput = document.querySelector('#media-library-upload-input');
  uploadInput?.addEventListener('change', () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    pageState.pendingFile = file;
    pageState.visibilityPicker = createVisibilityPickerState();
    rerender();
    loadCollaborators(pageState.visibilityPicker, { api, treeId, currentUserId }).then(rerender);
  });

  root.querySelector('#media-library-pending-cancel-btn')?.addEventListener('click', () => {
    pageState.pendingFile = null;
    rerender();
  });

  root.querySelector('#media-library-pending-confirm-btn')?.addEventListener('click', async () => {
    const file = pageState.pendingFile;
    if (!file) return;
    try {
      const { media } = await mediaApi.uploadMedia(api, treeId, {
        file,
        kind: kindForFile(file),
        title: file.name,
        ...getVisibilityPayload(pageState.visibilityPicker),
      });
      if (pageState.activeAlbumId) {
        await mediaApi.addMediaToAlbum(api, treeId, pageState.activeAlbumId, media.id);
      }
      pageState.pendingFile = null;
      await reloadMedia(pageState, { api, treeId }, rerender);
      showToast('Uploaded');
    } catch (error) {
      showToast(error.message || 'Upload failed', { type: 'error' });
    }
  });
}
