// Shared "comments + emoji reactions" widget, embedded into mediaLightbox.js
// (media detail modal) and timelinePanel.js (event detail page). Follows the
// createXState/renderXHtml/attachXListeners(root, state, rerenderFn)
// convention used by visibilityPicker.js - the widget owns no DOM root of
// its own, callers embed renderCommentSectionHtml's output into their own
// template and call attachCommentSectionListeners after every render.
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { showToast, showConfirmDialog } from './ui.js';
import * as commentsApi from './commentsApi.js';
import * as reactionsApi from './reactionsApi.js';

// Small fixed palette rather than a full emoji picker (none exists in this
// codebase yet) - matches the "chip array" pattern already used for filters
// elsewhere (e.g. timelinePanel.js's All/Mine toggle).
const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function relativeTime(isoString) {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(isoString).toLocaleDateString();
}

function commenterLabel(comment) {
  return comment.user_full_name || comment.user_email || 'Someone';
}

function commenterInitial(comment) {
  return commenterLabel(comment).charAt(0).toUpperCase();
}

export function createCommentSectionState() {
  return {
    loaded: false,
    comments: [],
    draft: '',
    submitting: false,
    reactionSummary: [],
    myReaction: null,
    // Consulted (and cleared) by mediaLightbox.js's render() after a post -
    // see the comment-submit handler below.
    scrollToBottom: false,
  };
}

export async function loadCommentSection(state, { api, treeId, targetType, targetId, currentUserId }, rerender) {
  try {
    const [{ comments }, { reactions, summary }] = await Promise.all([
      commentsApi.getComments(api, treeId, targetType, targetId),
      reactionsApi.getReactions(api, treeId, targetType, targetId),
    ]);
    state.comments = comments;
    state.reactionSummary = summary;
    state.myReaction = reactions.find((r) => r.user_id === currentUserId)?.emoji || null;
  } catch (error) {
    showToast(error.message || 'Could not load comments', { type: 'error' });
  } finally {
    state.loaded = true;
    rerender();
  }
}

function reactionBar(state, { idPrefix, readOnly }) {
  const countByEmoji = new Map(state.reactionSummary.map((r) => [r.emoji, r.count]));
  return `
    <div class="reaction-bar" data-id-prefix="${idPrefix}">
      ${REACTION_EMOJI.map((emoji) => {
        const count = countByEmoji.get(emoji) || 0;
        const active = state.myReaction === emoji;
        return `
          <button type="button" class="reaction-chip ${active ? 'reaction-chip-active' : ''}" data-emoji="${emoji}" ${readOnly ? 'disabled' : ''}>
            <span class="reaction-chip-emoji">${emoji}</span>${count ? `<span class="reaction-chip-count">${count}</span>` : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function commentRow(comment, { currentUserId, readOnly }) {
  const canDelete = !readOnly && comment.user_id === currentUserId;
  return `
    <li class="comment-item" data-comment-id="${comment.id}">
      <span class="user-avatar user-avatar-sm">${escapeHtml(commenterInitial(comment))}</span>
      <div class="comment-item-body">
        <p class="comment-item-meta">
          <span class="comment-item-author">${escapeHtml(commenterLabel(comment))}</span>
          <span class="comment-item-time muted">${relativeTime(comment.created_at)}</span>
        </p>
        <p class="comment-item-text">${escapeHtml(comment.body)}</p>
      </div>
      ${canDelete ? `<button type="button" class="icon-btn comment-delete-btn" data-comment-id="${comment.id}" aria-label="Delete comment">${icon('trash')}</button>` : ''}
    </li>
  `;
}

export function renderCommentSectionHtml(state, { idPrefix, currentUserId, readOnly = false }) {
  return `
    <div class="comment-section" data-id-prefix="${idPrefix}">
      ${reactionBar(state, { idPrefix, readOnly })}
      <p class="lightbox-tags-title comment-section-title">Comments</p>
      ${
        !state.loaded
          ? '<p class="muted">Loading&hellip;</p>'
          : `
        <ul class="comment-list">
          ${
            state.comments.length
              ? state.comments.map((c) => commentRow(c, { currentUserId, readOnly })).join('')
              : '<li class="muted comment-list-empty">No comments yet.</li>'
          }
        </ul>
        ${
          readOnly
            ? ''
            : `
          <div class="comment-form">
            <textarea id="${idPrefix}-comment-input" placeholder="Add a comment&hellip;" maxlength="2000" rows="2">${escapeHtml(state.draft)}</textarea>
            <button type="button" class="btn btn-primary" id="${idPrefix}-comment-submit-btn" ${state.draft.trim() && !state.submitting ? '' : 'disabled'}>Post</button>
          </div>
        `
        }
      `
      }
    </div>
  `;
}

// `rerenderFn` re-renders the surrounding page/modal (the section has no DOM
// root of its own), mirroring visibilityPicker.js's attachVisibilityPickerListeners.
export function attachCommentSectionListeners(root, state, { api, treeId, targetType, targetId, currentUserId, readOnly = false }, rerenderFn) {
  const section = root.querySelector('.comment-section');
  if (!section) return;

  section.querySelectorAll('.reaction-chip').forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener('click', async () => {
      const emoji = btn.dataset.emoji;
      const previousEmoji = state.myReaction;
      try {
        const { action } = await reactionsApi.toggleReaction(api, treeId, { targetType, targetId, emoji });
        state.myReaction = action === 'removed' ? null : emoji;
        const countByEmoji = new Map(state.reactionSummary.map((r) => [r.emoji, r.count]));
        if (previousEmoji) countByEmoji.set(previousEmoji, Math.max(0, (countByEmoji.get(previousEmoji) || 0) - 1));
        if (state.myReaction) countByEmoji.set(emoji, (countByEmoji.get(emoji) || 0) + 1);
        state.reactionSummary = [...countByEmoji.entries()].filter(([, count]) => count > 0).map(([e, count]) => ({ emoji: e, count }));
        rerenderFn();
      } catch (error) {
        showToast(error.message || 'Could not update reaction', { type: 'error' });
      }
    });
  });

  if (readOnly) return;

  const idPrefix = section.dataset.idPrefix;
  const input = section.querySelector(`#${idPrefix}-comment-input`);
  const submitBtn = section.querySelector(`#${idPrefix}-comment-submit-btn`);
  // Updates the Post button in place rather than calling rerenderFn() (a full
  // innerHTML replacement of the modal/page) on every keystroke - rebuilding
  // the DOM here would reset .lightbox-scroll's scrollTop and re-trigger the
  // browser's focus-follows-scroll behavior, yanking the scrollbar around
  // while typing. Nothing else in the section's markup depends on state.draft
  // mid-typing, so a full rerender isn't needed until the comment is posted.
  input?.addEventListener('input', () => {
    state.draft = input.value;
    if (submitBtn) submitBtn.disabled = !state.draft.trim() || state.submitting;
  });

  section.querySelector(`#${idPrefix}-comment-submit-btn`)?.addEventListener('click', async () => {
    const body = state.draft.trim();
    if (!body || state.submitting) return;
    state.submitting = true;
    try {
      const { comment } = await commentsApi.addComment(api, treeId, { targetType, targetId, body });
      state.comments = [...state.comments, comment];
      state.draft = '';
      state.submitting = false;
      // Tells the lightbox's render() (mediaLightbox.js) to scroll
      // .lightbox-scroll to the bottom after this rerender instead of
      // restoring the pre-post scroll position, so the just-posted comment
      // is visible. No-op on the Timeline page, which has no .lightbox-scroll
      // and handles this itself below via scrollIntoView.
      state.scrollToBottom = true;
      rerenderFn();
      // rerenderFn does a full innerHTML replacement of its own root (the
      // whole modal in mediaLightbox.js, the whole #app in main.js's
      // render()), so `root`/`section` captured above are now detached. On
      // the Timeline page (no .lightbox-scroll - the whole page scrolls),
      // there's no mediaLightbox.js render() to consult the flag above, so
      // scrollIntoView the fresh input directly instead.
      if (!document.querySelector('.lightbox-scroll')) {
        document.querySelector(`#${idPrefix}-comment-input`)?.scrollIntoView({ block: 'end' });
      }
    } catch (error) {
      state.submitting = false;
      showToast(error.message || 'Could not post comment', { type: 'error' });
      rerenderFn();
    }
  });

  section.querySelectorAll('.comment-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const commentId = Number(btn.dataset.commentId);
      showConfirmDialog({
        title: 'Delete Comment',
        message: 'Are you sure you want to delete this comment?',
        confirmLabel: 'Delete',
        onConfirm: async () => {
          try {
            await commentsApi.deleteComment(api, treeId, commentId);
            state.comments = state.comments.filter((c) => c.id !== commentId);
            rerenderFn();
          } catch (error) {
            showToast(error.message || 'Could not delete comment', { type: 'error' });
            throw error;
          }
        },
      });
    });
  });
}
