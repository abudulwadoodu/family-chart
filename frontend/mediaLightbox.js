// Shared "view one piece of media + its person tags" modal, used by both
// personMediaPanel.js (a single person's gallery) and mediaLibraryPanel.js
// (the tree-wide library) so the view/tag UI is built once. Read-only mode
// hides the upload/tag/delete affordances for viewers.
import { showModal, showToast, showConfirmDialog } from './ui.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { buildMemberSearchIndex, searchMembers } from './memberSearch.js';
import * as mediaApi from './mediaApi.js';
import { hydrateMediaSources } from './mediaSrc.js';

function memberLabel(memberIndex, memberId) {
  return memberIndex.find((m) => m.id === memberId)?.label || memberId;
}

function editForm({ title, description }) {
  return `
    <div class="lightbox-edit-form">
      <label>Title
        <input type="text" id="lightbox-edit-title" value="${escapeHtml(title)}" maxlength="200" placeholder="Untitled" />
      </label>
      <label>Description
        <textarea id="lightbox-edit-description" maxlength="2000" placeholder="Add a description&hellip;" rows="3">${escapeHtml(description)}</textarea>
      </label>
      <div class="modal-actions row">
        <button type="button" class="btn-secondary" id="lightbox-edit-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-primary" id="lightbox-edit-save-btn">Save</button>
      </div>
    </div>
  `;
}

function mediaBody({ media, tags, memberIndex, readOnly, tagQuery, tagResults, editing, editDraft, context }) {
  const isImage = media.kind === 'photo';
  const isVideo = media.kind === 'video';

  const preview = isImage
    ? `<img class="lightbox-media" data-media-src="${media.id}" alt="${escapeHtml(media.title || 'Photo')}" />`
    : isVideo
      ? `<video class="lightbox-media" data-media-src="${media.id}" controls></video>`
      : `<a class="lightbox-doc-link" data-media-src="${media.id}" target="_blank" rel="noopener">${icon('fileText')}<span>${escapeHtml(media.title || 'Open document')}</span></a>`;

  return `
    <button type="button" class="icon-btn modal-close" id="lightbox-close-btn" aria-label="Close">${icon('close')}</button>
    ${
      editing
        ? editForm(editDraft)
        : `
      <div class="lightbox-title-row">
        ${media.title ? `<h3>${escapeHtml(media.title)}</h3>` : '<h3 class="muted">Untitled</h3>'}
        ${readOnly ? '' : `<button type="button" class="icon-btn" id="lightbox-edit-btn" aria-label="Edit">${icon('pencil')}</button>`}
      </div>
    `
    }
    ${preview}
    ${!editing && media.description ? `<p class="modal-message">${escapeHtml(media.description)}</p>` : ''}

    ${
      editing
        ? ''
        : `
    <div class="lightbox-tags">
      <p class="lightbox-tags-title">Tagged people</p>
      <ul class="lightbox-tag-list">
        ${
          tags.length
            ? tags
                .map(
                  (tag) => `
              <li class="lightbox-tag-chip" data-tag-id="${tag.id}">
                <span>${escapeHtml(memberLabel(memberIndex, tag.member_id))}</span>
                ${tag.source === 'ai' ? `<span class="tag-source-badge">AI${tag.confirmed_at ? ' ✓' : ''}</span>` : ''}
                ${readOnly ? '' : `<button type="button" class="icon-btn lightbox-remove-tag-btn" data-tag-id="${tag.id}" aria-label="Remove tag">${icon('close')}</button>`}
              </li>`
                )
                .join('')
            : '<li class="muted">No one tagged yet.</li>'
        }
      </ul>

      ${
        readOnly
          ? ''
          : `
        <div class="lightbox-tag-add">
          <input type="text" id="lightbox-tag-input" placeholder="Tag a family member..." value="${escapeHtml(tagQuery)}" autocomplete="off" />
          ${
            tagResults.length
              ? `<ul class="lightbox-tag-suggestions">
                   ${tagResults.map((r) => `<li data-member-id="${escapeHtml(r.id)}">${escapeHtml(r.label)}</li>`).join('')}
                 </ul>`
              : ''
          }
        </div>`
      }
    </div>

    ${
      readOnly
        ? ''
        : `<div class="modal-actions row">
             ${
               context
                 ? `<button type="button" class="btn-secondary" id="lightbox-remove-from-context-btn">${icon('close')}<span>Remove from ${escapeHtml(context.name)}</span></button>`
                 : ''
             }
             <button type="button" class="btn-danger" id="lightbox-delete-btn">${icon('trash')}<span>Delete Permanently</span></button>
           </div>`
    }
    `
    }
  `;
}

// Builds the "this is also linked elsewhere" sentence for the delete
// confirmation, excluding the album/event the lightbox was opened from
// (that one's obvious from context - no need to repeat it back).
function describeOtherUsage(usage, context) {
  const albums = usage.albums.filter((a) => !(context?.type === 'album' && a.id === context.id)).map((a) => a.name);
  const events = usage.events.filter((e) => !(context?.type === 'event' && e.id === context.id)).map((e) => e.title);
  const parts = [];
  if (albums.length) parts.push(`the album${albums.length > 1 ? 's' : ''} "${albums.join('", "')}"`);
  if (events.length) parts.push(`the event${events.length > 1 ? 's' : ''} "${events.join('", "')}"`);
  if (usage.taggedMemberCount > 0) parts.push(`${usage.taggedMemberCount} tagged ${usage.taggedMemberCount === 1 ? 'person' : 'people'}`);
  if (!parts.length) return null;
  return `This will also remove it from ${parts.join(' and ')}.`;
}

export function openMediaLightbox({ api, treeId, media, memberIndex, readOnly = false, context, onDeleted, onRemovedFromContext, onTagsChanged, onUpdated }) {
  const state = {
    media,
    tags: [],
    tagQuery: '',
    tagResults: [],
    editing: false,
    editDraft: { title: '', description: '' },
  };

  const modal = showModal({ bodyHtml: '<p>Loading&hellip;</p>', className: 'modal-media-lightbox' });

  const render = () => {
    modal.setBody(
      mediaBody({
        media: state.media,
        tags: state.tags,
        memberIndex,
        readOnly,
        tagQuery: state.tagQuery,
        tagResults: state.tagResults,
        editing: state.editing,
        editDraft: state.editDraft,
        context,
      })
    );
    bindListeners();
    hydrateMediaSources(modal.root, new Map([[state.media.id, state.media]]));
  };

  function bindListeners() {
    modal.root.querySelector('#lightbox-close-btn').addEventListener('click', () => modal.close());

    if (readOnly) return;

    if (state.editing) {
      const bindCaretPreservingInput = (id, draftKey) => {
        const el = modal.root.querySelector(`#${id}`);
        el?.addEventListener('input', () => {
          state.editDraft[draftKey] = el.value;
          const caret = el.selectionStart;
          render();
          const freshEl = modal.root.querySelector(`#${id}`);
          freshEl?.focus();
          freshEl?.setSelectionRange(caret, caret);
        });
      };
      bindCaretPreservingInput('lightbox-edit-title', 'title');
      bindCaretPreservingInput('lightbox-edit-description', 'description');

      modal.root.querySelector('#lightbox-edit-cancel-btn').addEventListener('click', () => {
        state.editing = false;
        render();
      });

      modal.root.querySelector('#lightbox-edit-save-btn').addEventListener('click', async () => {
        try {
          const { media } = await mediaApi.updateMedia(api, treeId, state.media.id, {
            title: state.editDraft.title.trim(),
            description: state.editDraft.description.trim(),
          });
          state.media = media;
          state.editing = false;
          onUpdated?.(media);
          render();
          showToast('Media updated');
        } catch (error) {
          showToast(error.message || 'Could not update media', { type: 'error' });
        }
      });
      return;
    }

    modal.root.querySelector('#lightbox-edit-btn')?.addEventListener('click', () => {
      state.editDraft = { title: state.media.title || '', description: state.media.description || '' };
      state.editing = true;
      render();
    });

    modal.root.querySelectorAll('.lightbox-remove-tag-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tagId = Number(btn.dataset.tagId);
        try {
          await mediaApi.removeTag(api, treeId, state.media.id, tagId);
          state.tags = state.tags.filter((t) => t.id !== tagId);
          onTagsChanged?.(state.media.id, state.tags);
          render();
        } catch (error) {
          showToast(error.message || 'Could not remove tag', { type: 'error' });
        }
      });
    });

    const input = modal.root.querySelector('#lightbox-tag-input');
    input.addEventListener('input', () => {
      state.tagQuery = input.value;
      state.tagResults = state.tagQuery.trim() ? searchMembers(memberIndex, state.tagQuery, 8) : [];
      const caret = input.selectionStart;
      render();
      const freshInput = modal.root.querySelector('#lightbox-tag-input');
      freshInput?.focus();
      freshInput?.setSelectionRange(caret, caret);
    });

    modal.root.querySelectorAll('.lightbox-tag-suggestions li').forEach((li) => {
      li.addEventListener('click', async () => {
        const memberId = li.dataset.memberId;
        try {
          const { tag } = await mediaApi.tagMember(api, treeId, state.media.id, { memberId });
          state.tags = [...state.tags, tag];
          state.tagQuery = '';
          state.tagResults = [];
          onTagsChanged?.(state.media.id, state.tags);
          render();
        } catch (error) {
          showToast(error.message || 'Could not tag member', { type: 'error' });
        }
      });
    });

    modal.root.querySelector('#lightbox-remove-from-context-btn')?.addEventListener('click', async () => {
      try {
        if (context.type === 'album') {
          await mediaApi.removeMediaFromAlbum(api, treeId, context.id, state.media.id);
        } else {
          await mediaApi.detachMediaFromEvent(api, treeId, context.id, state.media.id);
        }
        onRemovedFromContext?.(state.media.id);
        modal.close();
        showToast(`Removed from ${context.name}`);
      } catch (error) {
        showToast(error.message || `Could not remove from ${context.name}`, { type: 'error' });
      }
    });

    modal.root.querySelector('#lightbox-delete-btn')?.addEventListener('click', async () => {
      let usage = null;
      try {
        usage = await mediaApi.getMediaUsage(api, treeId, state.media.id);
      } catch (_error) {
        // If the usage lookup fails, fall through to a plain confirmation
        // rather than blocking deletion entirely.
      }
      const otherUsageMessage = usage ? describeOtherUsage(usage, context) : null;
      showConfirmDialog({
        title: 'Delete Media Permanently',
        message: otherUsageMessage
          ? `Are you sure you want to permanently delete this? ${otherUsageMessage} This cannot be undone.`
          : 'Are you sure you want to permanently delete this? This cannot be undone.',
        confirmLabel: 'Delete Permanently',
        onConfirm: async () => {
          try {
            await mediaApi.deleteMedia(api, treeId, state.media.id);
            onDeleted?.(state.media.id);
            modal.close();
            showToast('Media deleted');
          } catch (error) {
            showToast(error.message || 'Could not delete media', { type: 'error' });
            throw error;
          }
        },
      });
    });
  }

  render();

  mediaApi
    .listTags(api, treeId, media.id)
    .then(({ tags }) => {
      state.tags = tags;
      render();
    })
    .catch(() => {
      state.tags = [];
      render();
    });

  return modal;
}

export { buildMemberSearchIndex };
