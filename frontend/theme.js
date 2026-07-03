const STORAGE_KEY = 'family-chart-theme';
const THEMES = ['dark', 'light'];
const DEFAULT_THEME = 'dark';

let mediaQuery = null;
let listeners = [];

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : DEFAULT_THEME;
}

function storedTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch (_error) {
    // localStorage can throw in privacy modes / sandboxed iframes - fall
    // back to system preference instead of breaking the app.
    return null;
  }
}

/**
 * Resolves the theme that should be active right now: an explicit user
 * choice from localStorage takes priority, otherwise the OS preference.
 * @returns {'dark' | 'light'}
 */
export function getPreferredTheme() {
  return storedTheme() || systemTheme();
}

/**
 * Applies a theme to the document root. Pure CSS variable/attribute
 * swap - no DOM rebuild, so this is safe to call at any time (including
 * mid-tree-render) without disturbing chart state.
 * @param {'dark' | 'light'} theme
 */
export function applyTheme(theme) {
  const resolved = THEMES.includes(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', resolved);
  listeners.forEach((fn) => fn(resolved));
}

/**
 * @param {'dark' | 'light'} theme
 */
export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (_error) {
    // Ignore write failures (e.g. storage quota, privacy mode) - the theme
    // still applies for this session via applyTheme below.
  }
  applyTheme(theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
  setTheme(current === 'dark' ? 'light' : 'dark');
}

/**
 * Sets up the initial theme and starts watching the OS-level
 * prefers-color-scheme setting. The system-preference listener only ever
 * applies while the user hasn't made an explicit choice - once they pick a
 * theme via setTheme(), it's pinned in localStorage and this listener stops
 * overriding it.
 * @param {(theme: 'dark' | 'light') => void} [onChange]
 */
export function initTheme(onChange) {
  if (onChange) listeners.push(onChange);
  applyTheme(getPreferredTheme());

  mediaQuery = window.matchMedia?.('(prefers-color-scheme: light)');
  mediaQuery?.addEventListener('change', (event) => {
    if (storedTheme()) return;
    applyTheme(event.matches ? 'light' : 'dark');
  });
}
