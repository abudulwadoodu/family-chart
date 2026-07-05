// Single keydown handler scoped to the Relationship Manager root, so the
// whole workflow works without a mouse: Tab cycles panels, arrows move a
// roving-tabindex row, Enter activates it, Esc steps the builder back, Ctrl+F
// focuses the active panel's search box, digit keys pick a relationship type
// during the choose-type step, and Ctrl+Z/Ctrl+Y undo/redo the last commit.
import { undo, redo } from './undoStack.js';
import { TYPE_OPTIONS } from '../relationshipDialog.js';

const PANEL_ORDER = ['left', 'middle', 'right'];

function isTextInput(target) {
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

export function attachRelationshipManagerKeyboard(state, render, root) {
  const rm = state.relationshipManager;

  const onKeyDown = (event) => {
    const target = event.target;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      if (undo(rm.undoStack, state.selectedTreeData)) {
        rm.dirty = true;
        render();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
      event.preventDefault();
      if (redo(rm.undoStack, state.selectedTreeData)) {
        rm.dirty = true;
        render();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      const searchId = rm.activePanel === 'right' ? '#rm-tree-search-input' : rm.activePanel === 'middle' ? '#rm-target-search-input' : '#rm-disconnected-search-input';
      root.querySelector(searchId)?.focus();
      return;
    }

    if (event.key === 'Tab' && !isTextInput(target)) {
      event.preventDefault();
      const currentIndex = PANEL_ORDER.indexOf(rm.activePanel);
      const delta = event.shiftKey ? -1 : 1;
      rm.activePanel = PANEL_ORDER[(currentIndex + delta + PANEL_ORDER.length) % PANEL_ORDER.length];
      render();
      return;
    }

    if (isTextInput(target)) return;

    if (event.key === 'Escape') {
      if (rm.builder.step !== 'select-target') {
        event.preventDefault();
        if (rm.builder.step === 'choose-type') rm.builder.step = 'select-target';
        else if (rm.builder.step === 'options') rm.builder.step = 'choose-type';
        else if (rm.builder.step === 'preview') rm.builder.step = 'options';
        render();
      }
      return;
    }

    if (rm.activePanel === 'left' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const rows = Array.from(root.querySelectorAll('.rm-member-row'));
      if (!rows.length) return;
      const currentPos = rows.findIndex((row) => Number(row.dataset.index) === rm.activeIndex);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextPos = currentPos === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, currentPos + delta));
      rm.activeIndex = Number(rows[nextPos].dataset.index);
      render();
      requestAnimationFrame(() => root.querySelector('.rm-member-row.is-active')?.focus());
      return;
    }

    if (rm.activePanel === 'left' && event.key === 'Enter') {
      const activeRow = root.querySelector('.rm-member-row.is-active');
      activeRow?.click();
      return;
    }

    if (rm.activePanel === 'middle' && rm.builder.step === 'choose-type' && /^[1-4]$/.test(event.key)) {
      const option = TYPE_OPTIONS[Number(event.key) - 1];
      if (!option) return;
      const radio = root.querySelector(`input[name="rm-rel-type"][value="${option.type}"]`);
      if (radio && !radio.disabled) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  };

  root.addEventListener('keydown', onKeyDown);
  return () => root.removeEventListener('keydown', onKeyDown);
}
