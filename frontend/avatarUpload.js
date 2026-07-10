// Two responsibilities for the profile panel's header avatar, wired via the
// family-chart library's setOnFormCreation hook (src/core/edit.ts):
//
// 1. hydrateAvatarPreview - resolves the header <img>'s data-avatar-src into
//    something the browser can actually load. Media URLs our own backend
//    issues are auth-gated (Bearer token, not a cookie), so a plain
//    <img src> can't load them - this fetches via the authenticated
//    fetchAttachment() wrapper and swaps in an object URL instead. Runs on
//    every form render (reopening the panel, switching people), not just
//    right after an upload.
// 2. attachAvatarUpload - wires the "Upload" link next to the Photo URL
//    field to a real upload: picks a file, POSTs it through the same media
//    pipeline as the rest of the app, tags it to this person, then writes
//    the resulting URL into the avatar text input (so Save persists it) and
//    refreshes the live circular preview. Only present when the form is
//    editable - src/renderers/create-form-html.ts doesn't render the
//    upload link for the read-only info view.
import { showToast } from './ui.js';
import * as mediaApi from './mediaApi.js';
import { loadMediaObjectUrl } from './mediaSrc.js';

const INTERNAL_MEDIA_URL_RE = /^\/api\/trees\/\d+\/media\/\d+\/file$/;

export function hydrateAvatarPreview(cont) {
  const img = cont.querySelector('img.f3-form-avatar-img[data-avatar-src]');
  if (!img) return;
  const url = img.dataset.avatarSrc;
  if (INTERNAL_MEDIA_URL_RE.test(url)) {
    loadMediaObjectUrl({ url })
      .then((objectUrl) => {
        if (!cont.isConnected) return;
        img.src = objectUrl;
      })
      .catch(() => {});
  } else {
    img.src = url;
  }
}

export function attachAvatarUpload({ cont, datum, api, treeId }) {
  const uploadLink = cont.querySelector('.f3-upload-link');
  const avatarInput = cont.querySelector('input[name="avatar"]');
  if (!uploadLink || !avatarInput) return;

  let fileInput = cont.querySelector('#person-avatar-upload-input');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'person-avatar-upload-input';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    cont.appendChild(fileInput);
  }

  uploadLink.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    const originalLinkText = uploadLink.textContent;
    uploadLink.textContent = 'Uploading…';
    uploadLink.style.pointerEvents = 'none';
    try {
      const { media } = await mediaApi.uploadMedia(api, treeId, { file, kind: 'photo', title: file.name });
      await mediaApi.tagMember(api, treeId, media.id, { memberId: datum.id });

      avatarInput.value = media.url;
      avatarInput.dispatchEvent(new Event('input', { bubbles: true }));

      const objectUrl = await loadMediaObjectUrl(media);
      const frame = cont.querySelector('.f3-form-avatar-frame');
      if (frame) {
        frame.innerHTML = `<img class="f3-form-avatar-img" src="${objectUrl}" alt="">`;
      }

      showToast('Photo uploaded');
    } catch (error) {
      showToast(error.message || 'Upload failed', { type: 'error' });
    } finally {
      uploadLink.textContent = originalLinkText;
      uploadLink.style.pointerEvents = '';
    }
  });
}
