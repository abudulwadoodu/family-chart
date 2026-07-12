// State factory for the Duplicate Manager view mode. Follows the same
// createXState() convention as relationshipManager/state.js. Mounted at
// state.duplicateManager in main.js and reset whenever a tree is closed/
// switched, since scan results and undo history are session-only. The
// dismissed-pairs list is the one exception - it's mirrored to localStorage
// (see loadDismissed/saveDismissed below) so "not a duplicate" survives a
// page refresh instead of resurfacing the pair on the next scan.
import { createUndoStack } from './undoStack.js';

export function createDuplicateManagerState() {
  return {
    candidates: [],
    scanStatus: 'idle', // 'idle' | 'scanning' | 'done'
    selectedPairKey: null,
    // true: first id in selectedPairKey (sorted) is the keep/survivor side.
    // false: swapped, so the second id is kept. Kept separate from
    // selectedPairKey itself (rather than reordering it) since selectedPairKey
    // doubles as the stable pair identity used for list-row highlighting and
    // the dismissed-pairs list, both of which rely on pairKey()'s sorted form.
    keepFirst: true,
    fieldChoices: {},
    dismissed: [], // pair keys the user explicitly said "not a duplicate"
    undoStack: createUndoStack(),
    dirty: false,
    search: '',
    sort: 'score', // 'score' | 'name' | 'birthYear'
  };
}

function dismissedStorageKey(treeId) {
  return `family-chart-duplicate-dismissed-${treeId}`;
}

// Reads the persisted dismissed-pairs list for a tree. Called from loadTree()
// so re-opening a tree (including after a full page refresh) restores what
// the user already ruled out, instead of the scan resurfacing those pairs.
export function loadDismissed(treeId) {
  try {
    const raw = window.localStorage.getItem(dismissedStorageKey(treeId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

// Mirrors dm.dismissed to localStorage. Ignores write failures (privacy
// mode, quota) the same way main.js's discovery-dismissed helper does -
// dismissal just won't persist, but the click itself still works this session.
export function saveDismissed(treeId, dismissed) {
  try {
    window.localStorage.setItem(dismissedStorageKey(treeId), JSON.stringify(dismissed));
  } catch (_error) {
    // Ignore write failures - dismissal just won't persist across reloads.
  }
}
