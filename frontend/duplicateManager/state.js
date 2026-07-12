// State factory for the Duplicate Manager view mode. Follows the same
// createXState() convention as relationshipManager/state.js. Mounted at
// state.duplicateManager in main.js and reset whenever a tree is closed/
// switched, since scan results and undo history are session-only.
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
