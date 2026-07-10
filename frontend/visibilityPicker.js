// Shared visibility control embedded into upload/create flows for media and
// events (Media Library upload, Timeline media-attach, per-person media tab
// upload, event create/edit). Presents three choices - "Everyone with tree
// access" / "Only me" / "Specific people" - which collapse to the backend's
// two-valued `visibility` ('tree'|'private') plus an optional `shareUserIds`
// list (see backend/utils/visibility.js): "Only me" submits
// visibility=private with an empty share list, "Specific people" submits
// visibility=private with the checked collaborator ids.
// Follows the createXState/renderXHtml/attachXListeners convention used by
// mediaLibraryPanel.js/timelinePanel.js. Collaborators are loaded eagerly
// (via loadCollaborators) when the picker mounts, so selecting "Specific
// people" just reveals an already-populated checklist rather than needing a
// fresh fetch mid-interaction.
import { escapeHtml } from './utils.js';
import * as mediaApi from './mediaApi.js';

const ROLE_LABELS = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

export function createVisibilityPickerState() {
  return {
    visibility: 'tree',
    // Tracks which of the three radio options is selected, independent of
    // shareUserIds.length - without this, picking "Specific people" before
    // checking anyone would have zero shareUserIds and get misread as
    // "Only me" on the next render, snapping the radio back.
    mode: 'tree',
    shareUserIds: [],
    collaborators: [],
    loaded: false,
  };
}

// Hydrates an existing item's visibility/shares into picker state (event
// edit form). `shareUserIds` comes from the GET response's `shareUserIds`
// field (only present when the requester has full access to a private item).
export function setVisibilityPickerValue(state, { visibility, shareUserIds }) {
  state.mode = visibility === 'private' ? (shareUserIds?.length ? 'specific' : 'only-me') : 'tree';
  state.visibility = visibility === 'private' ? 'private' : 'tree';
  state.shareUserIds = shareUserIds || [];
}

export async function loadCollaborators(state, { api, treeId, currentUserId }) {
  try {
    const { permissions } = await mediaApi.listCollaborators(api, treeId);
    state.collaborators = permissions.filter((p) => p.user_id !== currentUserId);
  } catch (_error) {
    state.collaborators = [];
  } finally {
    state.loaded = true;
  }
}

export function renderVisibilityPickerHtml(state, { idPrefix }) {
  const mode = state.mode || 'tree';
  const shareSet = new Set(state.shareUserIds);

  return `
    <div class="visibility-picker" data-id-prefix="${idPrefix}">
      <p class="visibility-picker-label">Who can see this?</p>
      <div class="visibility-picker-options">
        <label class="visibility-picker-option">
          <input type="radio" name="${idPrefix}-visibility" value="tree" ${mode === 'tree' ? 'checked' : ''} />
          <span>Everyone with tree access</span>
        </label>
        <label class="visibility-picker-option">
          <input type="radio" name="${idPrefix}-visibility" value="only-me" ${mode === 'only-me' ? 'checked' : ''} />
          <span>Only me</span>
        </label>
        <label class="visibility-picker-option">
          <input type="radio" name="${idPrefix}-visibility" value="specific" ${mode === 'specific' ? 'checked' : ''} />
          <span>Specific people</span>
        </label>
      </div>
      ${
        mode === 'specific'
          ? `<div class="visibility-picker-collaborators">
               ${
                 !state.loaded
                   ? '<p class="muted">Loading collaborators&hellip;</p>'
                   : state.collaborators.length
                     ? state.collaborators
                         .map(
                           (c) => `
                     <label class="member-row visibility-picker-collaborator-row">
                       <div class="member-info">
                         <span class="user-avatar user-avatar-sm">${escapeHtml((c.email || '?').charAt(0).toUpperCase())}</span>
                         <div>
                           <p class="member-email">${escapeHtml(c.email)}</p>
                           <p class="member-meta">
                             <span class="badge badge-role-${c.role}">${ROLE_LABELS[c.role] || c.role}</span>
                           </p>
                         </div>
                       </div>
                       <input type="checkbox" class="visibility-picker-share-checkbox" data-user-id="${c.user_id}" ${shareSet.has(c.user_id) ? 'checked' : ''} />
                     </label>`
                         )
                         .join('')
                     : '<p class="muted">No other collaborators on this tree yet.</p>'
               }
             </div>`
          : ''
      }
    </div>
  `;
}

// `rerenderFn` re-renders just enough of the surrounding form to reflect a
// mode change (e.g. revealing the collaborator checklist) - callers pass
// their own page/modal rerender since the picker has no DOM root of its own.
export function attachVisibilityPickerListeners(root, state, rerenderFn) {
  const picker = root.querySelector('.visibility-picker');
  if (!picker) return;

  picker.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.mode = radio.value;
      if (radio.value === 'tree') {
        state.visibility = 'tree';
        state.shareUserIds = [];
      } else if (radio.value === 'only-me') {
        state.visibility = 'private';
        state.shareUserIds = [];
      } else {
        state.visibility = 'private';
      }
      rerenderFn();
    });
  });

  picker.querySelectorAll('.visibility-picker-share-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const userId = Number(checkbox.dataset.userId);
      if (checkbox.checked) {
        if (!state.shareUserIds.includes(userId)) state.shareUserIds = [...state.shareUserIds, userId];
      } else {
        state.shareUserIds = state.shareUserIds.filter((id) => id !== userId);
      }
    });
  });
}

// Exact shape the POST/PATCH body fields expect - visibility='tree' never
// carries shareUserIds (backend ignores it for non-private items anyway, but
// omitting it keeps intent unambiguous).
export function getVisibilityPayload(state) {
  if (state.visibility !== 'private') return { visibility: 'tree', shareUserIds: [] };
  return { visibility: 'private', shareUserIds: state.shareUserIds };
}
