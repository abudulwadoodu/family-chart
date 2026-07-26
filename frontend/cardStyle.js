const STORAGE_KEY = 'family-chart-card-style';
const STYLES = ['circle', 'rect'];
const DEFAULT_STYLE = 'circle';

function storedCardStyle() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return STYLES.includes(value) ? value : null;
  } catch (_error) {
    // localStorage can throw in privacy modes / sandboxed iframes - fall
    // back to the default instead of breaking the tree viewer.
    return null;
  }
}

/**
 * Resolves the person-card style that should be active right now: an
 * explicit user choice from localStorage takes priority, otherwise the
 * default (circular avatar cards). Same-browser preference, not tied to any
 * one tree or role - every owner/editor/viewer who opens a tree on this
 * device sees whichever style they last picked.
 * @returns {'circle' | 'rect'}
 */
export function getCardStyle() {
  return storedCardStyle() || DEFAULT_STYLE;
}

/**
 * @param {'circle' | 'rect'} style
 */
export function setCardStyle(style) {
  if (!STYLES.includes(style)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch (_error) {
    // Ignore write failures (e.g. storage quota, privacy mode) - the choice
    // still applies for this session via the caller's re-render.
  }
}

/**
 * Flips the stored preference and returns the new style, so callers can
 * immediately re-render the chart and update their toggle button from one
 * call.
 * @returns {'circle' | 'rect'}
 */
export function toggleCardStyle() {
  const next = getCardStyle() === 'circle' ? 'rect' : 'circle';
  setCardStyle(next);
  return next;
}

/**
 * Maps our two-value preference to the family-chart library's CardHtml
 * style names (`setStyle()`) - 'imageCircle' for the circular-avatar layout
 * (examples/11-html-card-styling.html), 'imageRect' for the original wide
 * rectangle layout.
 * @param {'circle' | 'rect'} style
 */
export function toF3CardStyle(style) {
  return style === 'rect' ? 'imageRect' : 'imageCircle';
}
