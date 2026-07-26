const STORAGE_KEY = 'family-chart-tree-orientation';
const ORIENTATIONS = ['vertical', 'horizontal'];
const DEFAULT_ORIENTATION = 'vertical';

function storedOrientation() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return ORIENTATIONS.includes(value) ? value : null;
  } catch (_error) {
    // localStorage can throw in privacy modes / sandboxed iframes - fall
    // back to the default instead of breaking the tree viewer.
    return null;
  }
}

/**
 * Resolves the tree layout orientation that should be active right now: an
 * explicit user choice from localStorage takes priority, otherwise the
 * default (top-down vertical, matching the library's own default). Same-
 * browser preference, not tied to any one tree or role - every owner/editor/
 * viewer who opens a tree on this device sees whichever orientation they
 * last picked.
 * @returns {'vertical' | 'horizontal'}
 */
export function getTreeOrientation() {
  return storedOrientation() || DEFAULT_ORIENTATION;
}

/**
 * @param {'vertical' | 'horizontal'} orientation
 */
export function setTreeOrientation(orientation) {
  if (!ORIENTATIONS.includes(orientation)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, orientation);
  } catch (_error) {
    // Ignore write failures (e.g. storage quota, privacy mode) - the choice
    // still applies for this session via the caller's re-render.
  }
}

/**
 * Flips the stored preference and returns the new orientation, so callers
 * can immediately re-render the chart and update their toggle button from
 * one call.
 * @returns {'vertical' | 'horizontal'}
 */
export function toggleTreeOrientation() {
  const next = getTreeOrientation() === 'horizontal' ? 'vertical' : 'horizontal';
  setTreeOrientation(next);
  return next;
}
