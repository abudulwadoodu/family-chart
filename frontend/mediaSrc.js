// media.url points at an authenticated endpoint (backend/routes/media.js
// requires requireAuth/requireTreeRole), but auth is a Bearer token sent via
// the Authorization header (see api.js's getAuthHeader) - plain <img src>,
// <video src>, and <a href> can't attach that header, so every thumbnail/
// preview 404s as an unauthenticated request. Fetch the file through the
// authenticated fetchAttachment() wrapper instead and hand back an object URL
// the DOM can actually use.
import { fetchAttachment } from './api.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

const objectUrlCache = new Map();

// Shared thumbnail markup for a media item's grid tile - used by
// mediaLibraryPanel.js and timelinePanel.js so the photo/video/document
// treatment only needs to be defined once. A 'stub' row (backend's
// moderation-only shape for a private-and-shared item viewed by the tree
// owner - see backend/models/mediaModel.js's shapeForAccess) carries no
// storage_key/url, so it renders a locked placeholder instead of trying to
// load a real thumbnail.
export function mediaThumbHtml(item) {
  if (item.access === 'stub') {
    return `
      <div class="media-thumb-stub">
        ${icon('lock')}
        <span class="media-thumb-stub-label">Shared item</span>
      </div>
    `;
  }
  if (item.kind === 'photo') {
    return `<img data-media-src="${item.id}" alt="${escapeHtml(item.title || 'Photo')}" loading="lazy" />`;
  }
  if (item.kind === 'video') {
    return `<div class="media-thumb-video">${icon('image')}<span class="media-thumb-badge">▶</span></div>`;
  }
  return `<div class="media-thumb-doc">${icon('fileText')}</div>`;
}

export function loadMediaObjectUrl(media) {
  const cached = objectUrlCache.get(media.url);
  if (cached) return cached;

  const promise = fetchAttachment(media.url).then(({ blob }) => URL.createObjectURL(blob));
  objectUrlCache.set(media.url, promise);
  return promise;
}

// Resolves every `[data-media-src]` element under `root` (an <img>, <video>,
// or <a>) to its authenticated object URL. Elements are matched back up by
// media id once the fetch resolves, since `root` may have already
// re-rendered by then. Returns a promise that settles once every element has
// been resolved (or failed) - callers that need to react to the resulting
// layout shift (an <img>/<video> going from 0 height to its real size) can
// await this instead of assuming the DOM is already its final size
// synchronously after this call returns.
export function hydrateMediaSources(root, mediaById) {
  const tasks = [...root.querySelectorAll('[data-media-src]')].map((el) => {
    const media = mediaById.get(Number(el.dataset.mediaSrc));
    if (!media) return Promise.resolve();
    return loadMediaObjectUrl(media)
      .then((objectUrl) => {
        if (!root.isConnected) return;
        if (el.tagName === 'A') {
          el.href = objectUrl;
          return;
        }
        el.src = objectUrl;
        // Setting .src starts the fetch/decode asynchronously - an <img>/
        // <video> has ~0 rendered height until this resolves, so callers
        // waiting on the returned promise to react to the box's final size
        // (e.g. restoring a scroll position) need this, not just the src
        // assignment above.
        if (el.tagName === 'IMG') {
          return new Promise((resolve) => {
            el.addEventListener('load', resolve, { once: true });
            el.addEventListener('error', resolve, { once: true });
          });
        }
        if (el.tagName === 'VIDEO') {
          return new Promise((resolve) => {
            el.addEventListener('loadedmetadata', resolve, { once: true });
            el.addEventListener('error', resolve, { once: true });
          });
        }
      })
      .catch(() => {
        el.closest('.media-thumb-error')?.remove();
      });
  });
  return Promise.all(tasks);
}
