// Owner-only "Settings" tab in the tree viewer - the default focus person
// (who Focused mode opens onto for every viewer of this tree) and the
// default generation depth (how many generations of ancestry/progeny
// Focused mode renders before trimming - see setAncestryDepth/
// setProgenyDepth in main.js's renderChart()). Both persisted server-side
// via a single PATCH /api/trees/:id/settings call, distinct from the
// per-session "Reset View" target in main.js. Mirrors the shell pattern
// used by duplicateManager/relationshipManager: a components.js markup
// builder plus a listeners function that main.js calls after mounting it.
import { escapeHtml } from './utils.js';

export const MIN_GENERATION_DEPTH = 1;
export const MAX_GENERATION_DEPTH = 20;
export const DEFAULT_GENERATION_DEPTH = 4;

function personLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

export function renderTreeSettingsPanel(data, { currentDefaultMainId, currentGenerationDepth, currentEmailAutoVisibility, currentStatus = 'active' } = {}) {
  const people = [...(Array.isArray(data) ? data : [])].sort((a, b) => personLabel(a).localeCompare(personLabel(b)));

  const options = people
    .map((d) => `<option value="${escapeHtml(d.id)}" ${d.id === currentDefaultMainId ? 'selected' : ''}>${escapeHtml(personLabel(d))}</option>`)
    .join('');

  const isUnlimited = currentGenerationDepth === null || currentGenerationDepth === undefined;

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
        </div>
      </section>

      <section class="tree-settings-section">
        <h2 class="tree-settings-title">Generations to show</h2>
        <p class="tree-settings-desc">
          How many generations of ancestors and descendants Focused mode renders around the focused person
          before trimming the rest, so large trees stay fast and readable. Set to unlimited to never trim.
        </p>
        <div class="tree-settings-row">
          <label class="tree-settings-checkbox-label">
            <input type="checkbox" id="tree-settings-unlimited-depth-checkbox" ${isUnlimited ? 'checked' : ''} />
            Unlimited
          </label>
          <input
            type="number"
            id="tree-settings-generation-depth-input"
            class="tree-settings-number-input"
            min="${MIN_GENERATION_DEPTH}"
            max="${MAX_GENERATION_DEPTH}"
            step="1"
            value="${isUnlimited ? DEFAULT_GENERATION_DEPTH : currentGenerationDepth}"
            ${isUnlimited ? 'disabled' : ''}
          />
        </div>
      </section>

      <section class="tree-settings-section">
        <h2 class="tree-settings-title">Email auto-visibility</h2>
        <p class="tree-settings-desc">
          When enabled, anyone who signs in with an email address that matches a person's email in this tree is
          automatically given Viewer access - no join request needed. Existing Editor/Owner access is never
          downgraded by this.
        </p>
        <div class="tree-settings-row">
          <label class="tree-settings-checkbox-label">
            <input type="checkbox" id="tree-settings-email-auto-visibility-checkbox" ${currentEmailAutoVisibility ? 'checked' : ''} />
            Automatically grant viewer access by matching email
          </label>
        </div>
      </section>

      <div class="tree-settings-actions">
        <button type="button" id="tree-settings-save-btn" class="btn btn-primary btn-sm">Save settings</button>
      </div>
      <p class="field-error" id="tree-settings-error" role="alert"></p>

      <section class="tree-settings-section tree-settings-danger-zone">
        <h2 class="tree-settings-title">Danger zone</h2>
        <p class="tree-settings-desc">
          ${
            currentStatus === 'disabled'
              ? 'This tree is disabled. Nobody, including you, can open it until you re-enable it. Tree data is not affected.'
              : 'Disabling this tree blocks you and every collaborator from opening it until you re-enable it. Tree data is not affected.'
          }
        </p>
        <div class="tree-settings-row">
          ${
            currentStatus === 'disabled'
              ? '<button type="button" id="tree-settings-enable-btn" class="btn btn-secondary btn-sm">Enable tree</button>'
              : '<button type="button" id="tree-settings-disable-btn" class="btn btn-danger btn-sm">Disable tree</button>'
          }
        </div>
      </section>
    </div>
  `;
}
