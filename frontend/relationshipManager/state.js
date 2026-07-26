// State factory for the Relationship Manager view mode. Follows the same
// createXState() convention as relationshipBuilder.js / admin/*/logic.js.
// Mounted at state.relationshipManager in main.js and reset whenever a tree
// is closed/switched, since recent-context and undo history are session-only
// and should never leak across trees.
import { createUndoStack } from './undoStack.js';

export function createRelationshipManagerState() {
  return {
    disconnectedSearch: '',
    disconnectedSort: 'name', // 'name' | 'recent' | 'birthYear'
    disconnectedPage: 1,
    disconnectedPageSize: 25,
    // When false (default), the left panel lists only zero-rels members
    // ("Needs Connection"). When true, it lists everyone, so an already-
    // connected member can be picked as a source for an additional
    // relationship (e.g. adding a second parent, or linking an existing
    // member into a different branch).
    showAllMembers: false,
    selectedSourceIds: [],
    lastClickedIndex: null,
    keepSelection: false,
    activeIndex: -1,
    activePanel: 'left', // 'left' | 'middle' | 'right'

    builder: {
      step: 'select-target', // 'select-target' | 'choose-type' | 'options' | 'preview'
      targetId: null,
      type: null,
      subtype: null,
      marriageDate: '',
      divorceDate: '',
      status: 'current',
      targetSearchQuery: '',
      targetSearchResults: [],
      perItemResults: [], // [{ sourceId, label, valid, reason? }]
      // When linking a child to a parent who already has a real spouse, the
      // user can opt into also linking the child to that spouse as a second
      // parent - see getCoParentContext() in builderPanel.js. null means "no,
      // don't link an additional parent" (the safe default - never assumed).
      coParentId: null,
      coParentResults: [], // [{ sourceId, label, valid, reason? }]
    },

    tree: {
      expandedIds: new Set(),
      search: '',
      highlightId: null,
    },

    recent: { memberIds: [], types: [] },
    undoStack: createUndoStack(),
    dirty: false,
  };
}
