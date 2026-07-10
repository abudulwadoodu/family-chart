// Owner-only "Settings" tab in the tree viewer - currently just the default
// focus person (who Focused mode opens onto for every viewer of this tree,
// persisted server-side via PATCH /api/trees/:id/settings, distinct from the
// per-session "Reset View" target in main.js). Mirrors the shell pattern
// used by duplicateManager/relationshipManager: a components.js markup
// builder plus a listeners function that main.js calls after mounting it.
import { escapeHtml } from './utils.js';

function personLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

export function renderTreeSettingsPanel(data, { currentDefaultMainId } = {}) {
  const people = [...(Array.isArray(data) ? data : [])].sort((a, b) => personLabel(a).localeCompare(personLabel(b)));

  const options = people
    .map((d) => `<option value="${escapeHtml(d.id)}" ${d.id === currentDefaultMainId ? 'selected' : ''}>${escapeHtml(personLabel(d))}</option>`)
    .join('');

  return `
    <div class="tree-settings-shell" id="tree-settings-root">
      <section class="tree-settings-section">
        <h2 class="tree-settings-title">Default focus person</h2>
        <p class="tree-settings-desc">
          Whoever is selected here is who Focused mode opens on by default for anyone viewing this tree -
          including "Reset View". Leave unset to fall back to the largest connected family group.
        </p>
        <div class="tree-settings-row">
          <select id="tree-settings-default-main-select" class="tree-settings-select">
            <option value="">No default (use automatic)</option>
            ${options}
          </select>
          <button type="button" id="tree-settings-save-btn" class="btn btn-primary btn-sm">Save</button>
        </div>
        <p class="field-error" id="tree-settings-error" role="alert"></p>
      </section>
    </div>
  `;
}
