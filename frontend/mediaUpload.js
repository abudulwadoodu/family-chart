// Shared drag-and-drop / clipboard-paste / multi-file-select wiring for the
// two places that upload raw files into the media pipeline (mediaLibraryPanel.js's
// upload button, timelinePanel.js's Attach Media picker). Both already accept
// one File via a hidden <input type="file">+ mediaApi.uploadMedia - this just
// adds more ways to produce that same list of File objects, plus a small
// queue model (uploadFiles/pendingKind) for handling several files at once.

const ACCEPTED_MIME_RE = /^(image|video)\//;
const ACCEPTED_EXT_RE = /\.(pdf|docx?|)$/i;

export function isAcceptedFile(file) {
  if (!file) return false;
  if (ACCEPTED_MIME_RE.test(file.type)) return true;
  if (file.type === 'application/pdf' || file.type.includes('msword') || file.type.includes('officedocument.wordprocessingml')) return true;
  return ACCEPTED_EXT_RE.test(file.name || '') && !!(file.name || '').match(/\.\w+$/);
}

export function kindForFile(file) {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

// Pending-upload queue entries need an identity that survives status updates
// (mediaLibraryPanel.js/timelinePanel.js replace an entry with a new object -
// `{ ...entry, status: 'uploading' }' - rather than mutating it in place, so
// callers can't dedupe/remove by object reference once a status change has
// happened; array index breaks too once uploads can finish out of order).
// `file` isn't reliably unique in File API, so entries get their own counter.
let nextPendingId = 0;

export function createPendingFileEntry(file) {
  nextPendingId += 1;
  return { id: nextPendingId, file, status: 'pending' };
}

// Wires a drop target: dragenter/dragover toggles `activeClass` for visual
// feedback, drop hands the dropped files to onFiles. Attach once per root
// element re-render (root is replaced on every rerender() like the rest of
// this codebase's DOM, so listeners here don't need explicit teardown).
export function attachDropZone(root, { activeClass = 'drop-active', onFiles }) {
  if (!root) return;
  let dragDepth = 0;

  root.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragDepth += 1;
    root.classList.add(activeClass);
  });

  root.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
  });

  root.addEventListener('dragleave', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) root.classList.remove(activeClass);
  });

  root.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragDepth = 0;
    root.classList.remove(activeClass);
    const files = [...(event.dataTransfer.files || [])].filter(isAcceptedFile);
    if (files.length) onFiles(files);
  });
}

// Wires Ctrl+V/Cmd+V anywhere on the page to pick up pasted images (e.g.
// copying a screenshot then pasting straight into the upload area). Scoped to
// `document` since paste events don't target a specific element the way drop
// does. `attachXPageListeners` re-runs on every rerender() against fresh DOM,
// so this installs at most one real `document` listener per callback slot
// (keyed by `key`) and just swaps out which callback it delegates to - avoids
// stacking a duplicate `document` listener on every rerender.
const pasteDelegates = new Map();

export function attachPasteListener(key, { isActive, onFiles }) {
  pasteDelegates.set(key, { isActive, onFiles });
  if (pasteDelegates.__installed) return;
  pasteDelegates.__installed = true;

  document.addEventListener('paste', (event) => {
    for (const { isActive: active, onFiles: handle } of pasteDelegates.values()) {
      if (!active()) continue;
      const items = [...(event.clipboardData?.items || [])];
      const files = items
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter(isAcceptedFile);
      if (!files.length) continue;
      event.preventDefault();
      handle(files);
      return;
    }
  });
}
