// Shared "view one piece of media + its person tags" modal, used by
// mediaLibraryPanel.js (the tree-wide library) and timelinePanel.js so the
// view/tag UI is built once. Read-only mode hides the upload/tag/delete
// affordances for viewers.
import { showModal, showToast, showConfirmDialog } from './ui.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { buildMemberSearchIndex, searchMembers } from './memberSearch.js';
import * as mediaApi from './mediaApi.js';
import { hydrateMediaSources } from './mediaSrc.js';
import {
  createVisibilityPickerState,
  setVisibilityPickerValue,
  loadCollaborators,
  renderVisibilityPickerHtml,
  attachVisibilityPickerListeners,
  getVisibilityPayload,
} from './visibilityPicker.js';
import {
  createCommentSectionState,
  loadCommentSection,
  renderCommentSectionHtml,
  attachCommentSectionListeners,
} from './commentSection.js';

function memberLabel(memberIndex, memberId) {
  return memberIndex.find((m) => m.id === memberId)?.label || memberId;
}

// Compact "who can see this" summary shown in view mode, independent of the
// title/description pencil-edit - visibility was previously only reachable
// by clicking that pencil, which read as "edit title" and buried the
// sharing control where people didn't think to look for it.
function visibilitySummary(media, shareCount) {
  if (media.visibility !== 'private') {
    return { icon: 'eye', label: 'Everyone with tree access' };
  }
  if (!shareCount) {
    return { icon: 'lock', label: 'Only me' };
  }
  return { icon: 'lock', label: `Shared with ${shareCount} ${shareCount === 1 ? 'person' : 'people'}` };
}

function visibilityBadge(media, shareCount, readOnly) {
  const summary = visibilitySummary(media, shareCount);
  if (readOnly) {
    return `
      <p class="lightbox-visibility-badge lightbox-visibility-static">
        ${icon(summary.icon)}<span>${escapeHtml(summary.label)}</span>
      </p>
    `;
  }
  return `
    <button type="button" class="lightbox-visibility-badge" id="lightbox-visibility-btn">
      ${icon(summary.icon)}<span>${escapeHtml(summary.label)}</span>${icon('pencil')}
    </button>
  `;
}

function editForm({ title }) {
  return `
    <div class="lightbox-edit-form">
      <label>Title
        <input type="text" id="lightbox-edit-title" value="${escapeHtml(title)}" maxlength="200" placeholder="Untitled" />
      </label>
      <div class="modal-actions row">
        <button type="button" class="btn-secondary" id="lightbox-edit-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-primary" id="lightbox-edit-save-btn">Save</button>
      </div>
    </div>
  `;
}

function descriptionEditForm(description) {
  return `
    <div class="lightbox-edit-form">
      <label>Description
        <textarea id="lightbox-edit-description" maxlength="2000" placeholder="Add a description&hellip;" rows="3">${escapeHtml(description)}</textarea>
      </label>
      <div class="modal-actions row">
        <button type="button" class="btn-secondary" id="lightbox-description-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-primary" id="lightbox-description-save-btn">Save</button>
      </div>
    </div>
  `;
}

// Description row shown in view mode, independent of the title pencil - an
// item uploaded without a description (uploads don't collect one upfront)
// previously rendered nothing at all here, giving no hint you could add one.
function descriptionRow(media, readOnly) {
  if (readOnly) {
    return media.description ? `<p class="modal-message lightbox-description">${escapeHtml(media.description)}</p>` : '';
  }
  return media.description
    ? `
      <div class="lightbox-description-row">
        <p class="modal-message lightbox-description">${escapeHtml(media.description)}</p>
        <button type="button" class="icon-btn" id="lightbox-description-btn" aria-label="Edit description">${icon('pencil')}</button>
      </div>
    `
    : `
      <button type="button" class="lightbox-description-add-btn" id="lightbox-description-btn">
        ${icon('pencil')}<span>Add a description&hellip;</span>
      </button>
    `;
}

function visibilityEditForm(visibilityPicker) {
  return `
    <div class="lightbox-edit-form">
      ${renderVisibilityPickerHtml(visibilityPicker, { idPrefix: 'lightbox-edit-media' })}
      <div class="modal-actions row">
        <button type="button" class="btn-secondary" id="lightbox-visibility-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-primary" id="lightbox-visibility-save-btn">Save</button>
      </div>
    </div>
  `;
}

function mediaBody({ media, tags, memberIndex, readOnly, tagQuery, tagResults, editing, editDraft, editingVisibility, visibilityPicker, shareCount, editingDescription, descriptionDraft, context, commentState, currentUserId }) {
  const isImage = media.kind === 'photo';
  const isVideo = media.kind === 'video';
  const showingForm = editing || editingVisibility || editingDescription;

  const preview = isImage
    ? `<img class="lightbox-media" data-media-src="${media.id}" alt="${escapeHtml(media.title || 'Photo')}" />`
    : isVideo
      ? `<video class="lightbox-media" data-media-src="${media.id}" controls></video>`
      : `<a class="lightbox-doc-link" data-media-src="${media.id}" target="_blank" rel="noopener">${icon('fileText')}<span>${escapeHtml(media.title || 'Open document')}</span></a>`;

  return `
    <button type="button" class="icon-btn modal-close" id="lightbox-close-btn" aria-label="Close">${icon('close')}</button>
    ${
      !readOnly && !showingForm
        ? `<button type="button" class="btn btn-sm btn-danger lightbox-delete-top-btn" id="lightbox-delete-btn">${icon('trash')}<span>Delete</span></button>`
        : ''
    }
    <div class="lightbox-scroll">
    ${
      editing
        ? editForm(editDraft)
        : `
      <div class="lightbox-title-row">
        ${media.title ? `<h3>${escapeHtml(media.title)}</h3>` : '<h3 class="muted">Untitled</h3>'}
        ${readOnly ? '' : `<button type="button" class="icon-btn" id="lightbox-edit-btn" aria-label="Edit title">${icon('pencil')}</button>`}
      </div>
    `
    }
    ${
      editingVisibility
        ? visibilityEditForm(visibilityPicker)
        : editing
          ? ''
          : visibilityBadge(media, shareCount, readOnly)
    }
    ${preview}
    ${editingDescription ? descriptionEditForm(descriptionDraft) : editing || editingVisibility ? '' : descriptionRow(media, readOnly)}

    ${
      showingForm
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

    ${renderCommentSectionHtml(commentState, { idPrefix: 'lightbox', currentUserId })}

    ${
      readOnly || !context
        ? ''
        : `<div class="modal-actions row">
             <button type="button" class="btn-secondary" id="lightbox-remove-from-context-btn">${icon('close')}<span>Remove from ${escapeHtml(context.name)}</span></button>
           </div>`
    }
    `
    }
    </div>
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

// Moderation-only view for a 'stub' row (backend/models/mediaModel.js's
// shapeForAccess): the tree owner viewing a private item shared with someone
// else, but not with them. Carries no storage_key, so there's no real
// content to preview - just enough metadata (uploader, date, kind) to decide
// whether to delete it. `DELETE /:mediaId` already allows this (see
// media.js's route comment), it's the read paths that are locked down.
function stubBody({ media }) {
  const uploadedDate = media.created_at ? new Date(media.created_at).toLocaleDateString() : 'Unknown date';
  return `
    <button type="button" class="icon-btn modal-close" id="lightbox-close-btn" aria-label="Close">${icon('close')}</button>
    <div class="lightbox-scroll">
    <div class="lightbox-stub">
      <div class="lightbox-stub-icon">${icon('lock')}</div>
      <h3>Shared with specific people</h3>
      <p class="modal-message">
        This ${escapeHtml(media.kind || 'item')} was shared with select collaborators, not the whole tree.
        As owner you can see who uploaded it and remove it, but not view its contents.
      </p>
      <p class="modal-message"><strong>Uploaded:</strong> ${escapeHtml(uploadedDate)}</p>
      <div class="modal-actions row">
        <button type="button" class="btn-danger" id="lightbox-stub-delete-btn">${icon('trash')}<span>Delete</span></button>
      </div>
    </div>
    </div>
  `;
}

export function openMediaStubModal({ api, treeId, media, onDeleted }) {
  const modal = showModal({ bodyHtml: stubBody({ media }), className: 'modal-media-lightbox' });

  modal.root.querySelector('#lightbox-close-btn').addEventListener('click', () => modal.close());

  modal.root.querySelector('#lightbox-stub-delete-btn').addEventListener('click', () => {
    showConfirmDialog({
      title: 'Delete Media',
      message: 'This item is only visible to you as a moderation stub - are you sure you want to permanently delete it?',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await mediaApi.deleteMedia(api, treeId, media.id);
          onDeleted?.(media.id);
          modal.close();
          showToast('Media deleted');
        } catch (error) {
          showToast(error.message || 'Could not delete media', { type: 'error' });
          throw error;
        }
      },
    });
  });

  return modal;
}

export function openMediaLightbox({ api, treeId, media, memberIndex, currentUserId, readOnly = false, context, onDeleted, onRemovedFromContext, onTagsChanged, onUpdated }) {
  const state = {
    media,
    tags: [],
    tagQuery: '',
    tagResults: [],
    editing: false,
    editDraft: { title: '' },
    editingVisibility: false,
    visibilityPicker: createVisibilityPickerState(),
    shareCount: 0,
    editingDescription: false,
    descriptionDraft: '',
    commentState: createCommentSectionState(),
  };

  const modal = showModal({ bodyHtml: '<p>Loading&hellip;</p>', className: 'modal-media-lightbox' });

  const render = () => {
    // setBody does a full innerHTML replacement, which rebuilds
    // .lightbox-scroll from scratch and resets its scrollTop to 0 - without
    // restoring it, any rerender triggered while scrolled down (e.g. posting
    // a comment) snaps the view back to the top, hiding the very content
    // (the new comment, the input) the user was just interacting with.
    const scrollTop = modal.root.querySelector('.lightbox-scroll')?.scrollTop ?? 0;
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
        editingVisibility: state.editingVisibility,
        visibilityPicker: state.visibilityPicker,
        shareCount: state.shareCount,
        editingDescription: state.editingDescription,
        descriptionDraft: state.descriptionDraft,
        context,
        commentState: state.commentState,
        currentUserId,
      })
    );
    bindListeners();
    // The media preview has ~0 rendered height until its object URL loads
    // (see mediaSrc.js), so the scroll restore below runs twice: once
    // immediately (covers the common case where the image is already cached
    // from an earlier render and loads instantly) and again once
    // hydrateMediaSources' returned promise settles, in case the image was
    // still loading and its arrival shifted .lightbox-scroll's total height
    // out from under the first restore.
    const restoreScroll = () => {
      const scrollEl = modal.root.querySelector('.lightbox-scroll');
      if (scrollEl && modal.root.isConnected) scrollEl.scrollTop = scrollTop;
    };
    hydrateMediaSources(modal.root, new Map([[state.media.id, state.media]])).then(restoreScroll);
    restoreScroll();
  };

  // Loads the current share list once up front (not just when entering
  // visibility-edit mode) so the badge can show an accurate "Shared with N
  // people" count without the requester needing to click into edit first.
  async function loadShareCount() {
    if (state.media.visibility !== 'private') {
      state.shareCount = 0;
      return;
    }
    try {
      const usage = await mediaApi.getMediaUsage(api, treeId, state.media.id);
      state.shareCount = (usage.shareUserIds || []).length;
    } catch (_error) {
      state.shareCount = 0;
    }
  }

  function bindListeners() {
    modal.root.querySelector('#lightbox-close-btn').addEventListener('click', () => modal.close());

    attachCommentSectionListeners(
      modal.root,
      state.commentState,
      { api, treeId, targetType: 'media', targetId: state.media.id, currentUserId },
      render
    );

    if (readOnly) return;

    if (state.editingVisibility) {
      attachVisibilityPickerListeners(modal.root, state.visibilityPicker, render);

      modal.root.querySelector('#lightbox-visibility-cancel-btn').addEventListener('click', () => {
        state.editingVisibility = false;
        render();
      });

      modal.root.querySelector('#lightbox-visibility-save-btn').addEventListener('click', async () => {
        try {
          const { media } = await mediaApi.updateMedia(api, treeId, state.media.id, {
            title: state.media.title || '',
            description: state.media.description || '',
            ...getVisibilityPayload(state.visibilityPicker),
          });
          state.media = media;
          state.editingVisibility = false;
          onUpdated?.(media);
          render();
          loadShareCount().then(render);
          showToast('Sharing updated');
        } catch (error) {
          showToast(error.message || 'Could not update sharing', { type: 'error' });
        }
      });
      return;
    }

    modal.root.querySelector('#lightbox-visibility-btn')?.addEventListener('click', async () => {
      state.visibilityPicker = createVisibilityPickerState();
      let shareUserIds = [];
      try {
        const usage = await mediaApi.getMediaUsage(api, treeId, state.media.id);
        shareUserIds = usage.shareUserIds || [];
      } catch (_error) {
        // Fall through with an empty share list rather than blocking edit entirely.
      }
      setVisibilityPickerValue(state.visibilityPicker, { visibility: state.media.visibility, shareUserIds });
      state.editingVisibility = true;
      render();
      loadCollaborators(state.visibilityPicker, { api, treeId, currentUserId }).then(render);
    });

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

      modal.root.querySelector('#lightbox-edit-cancel-btn').addEventListener('click', () => {
        state.editing = false;
        render();
      });

      modal.root.querySelector('#lightbox-edit-save-btn').addEventListener('click', async () => {
        try {
          const { media } = await mediaApi.updateMedia(api, treeId, state.media.id, {
            title: state.editDraft.title.trim(),
            description: state.media.description || '',
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

    if (state.editingDescription) {
      const descTextarea = modal.root.querySelector('#lightbox-edit-description');
      descTextarea?.addEventListener('input', () => {
        state.descriptionDraft = descTextarea.value;
      });

      modal.root.querySelector('#lightbox-description-cancel-btn').addEventListener('click', () => {
        state.editingDescription = false;
        render();
      });

      modal.root.querySelector('#lightbox-description-save-btn').addEventListener('click', async () => {
        try {
          const { media } = await mediaApi.updateMedia(api, treeId, state.media.id, {
            title: state.media.title || '',
            description: state.descriptionDraft.trim(),
          });
          state.media = media;
          state.editingDescription = false;
          onUpdated?.(media);
          render();
          showToast('Description updated');
        } catch (error) {
          showToast(error.message || 'Could not update description', { type: 'error' });
        }
      });
      return;
    }

    modal.root.querySelector('#lightbox-edit-btn')?.addEventListener('click', () => {
      state.editDraft = { title: state.media.title || '' };
      state.editing = true;
      render();
    });

    modal.root.querySelector('#lightbox-description-btn')?.addEventListener('click', () => {
      state.descriptionDraft = state.media.description || '';
      state.editingDescription = true;
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

  loadShareCount().then(render);

  loadCommentSection(
    state.commentState,
    { api, treeId, targetType: 'media', targetId: media.id, currentUserId },
    render
  );

  return modal;
}

export { buildMemberSearchIndex };
