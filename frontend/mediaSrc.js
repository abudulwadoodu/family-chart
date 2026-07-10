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
// treatment only needs to be defined once.
export function mediaThumbHtml(item) {
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
// re-rendered by then.
export function hydrateMediaSources(root, mediaById) {
  root.querySelectorAll('[data-media-src]').forEach((el) => {
    const media = mediaById.get(Number(el.dataset.mediaSrc));
    if (!media) return;
    loadMediaObjectUrl(media)
      .then((objectUrl) => {
        if (!root.isConnected) return;
        if (el.tagName === 'A') el.href = objectUrl;
        else el.src = objectUrl;
      })
      .catch(() => {
        el.closest('.media-thumb-error')?.remove();
      });
  });
}
