// Reusable searchable person combobox for the Relationship Finder (see
// relationshipFinder.js), which needs two independent instances at once
// (Person A, Person B) - unlike memberSearch.js's single floating widget,
// this can't be module-level singleton state. createPersonCombobox()
// returns one instance per call, each with its own closed-over state, ids
// namespaced by the `id` option so the two instances' DOM/listeners never
// collide.
//
// Reuses buildMemberSearchIndex/searchMembers from memberSearch.js (same
// substring/startsWith ranking) and the .member-search* CSS classes, adding
// avatar + birth/death-year rows to each option so people who share a name
// stay distinguishable (see relationship-finder-v2-design.md).

import { buildMemberSearchIndex, searchMembers, getLabel } from './memberSearch.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

function getVitalYears(person) {
  const birth = String(person?.data?.birthday || '').match(/\d{4}/);
  const death = String(person?.data?.death || '').match(/\d{4}/);
  if (birth && death) return `${birth[0]}–${death[0]}`;
  if (birth) return `b. ${birth[0]}`;
  if (death) return `d. ${death[0]}`;
  return '';
}

function getInitials(person) {
  const label = getLabel(person).trim();
  if (!label) return '?';
  const parts = label.split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

function avatarHtml(person) {
  const avatarUrl = person?.data?.avatar;
  return avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" />`
    : `<span class="combobox-avatar-fallback">${escapeHtml(getInitials(person))}</span>`;
}

function optionInnerHtml(person, query) {
  const years = getVitalYears(person);
  return `
    <span class="combobox-avatar">${avatarHtml(person)}</span>
    <span class="combobox-option-text">
      <span class="combobox-option-name">${highlightMatch(getLabel(person), query)}</span>
      ${years ? `<span class="combobox-option-years">${escapeHtml(years)}</span>` : ''}
    </span>
  `;
}

function highlightMatch(label, query) {
  const q = (query || '').trim();
  if (!q) return escapeHtml(label);
  const at = label.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return escapeHtml(label);
  return (
    escapeHtml(label.slice(0, at)) +
    '<strong>' + escapeHtml(label.slice(at, at + q.length)) + '</strong>' +
    escapeHtml(label.slice(at + q.length))
  );
}

/**
 * @param {{
 *   id: string,                          namespaces this instance's element ids
 *   label: string,                       visible field label ("Person A")
 *   data: Array,                         full person list
 *   onSelect: (personId: string|null) => void,
 *   excludeId?: () => (string|null),     id to hide from results (the other picker's selection)
 * }} options
 */
export function createPersonCombobox({ id, label, data, onSelect, excludeId }) {
  const byId = new Map((data || []).map((p) => [String(p.id), p]));
  const index = buildMemberSearchIndex(data);
  const state = { results: [], activeIndex: -1, selectedId: null, query: '' };

  const sel = (suffix) => `#rf-combobox-${id}-${suffix}`;

  function getEls(container) {
    return {
      input: container.querySelector(sel('input')),
      clearBtn: container.querySelector(sel('clear')),
      resultsEl: container.querySelector(sel('results')),
    };
  }

  function render({ selectedId } = {}) {
    state.selectedId = selectedId != null ? String(selectedId) : null;
    const selectedPerson = state.selectedId ? byId.get(state.selectedId) : null;

    return `
      <div class="rf-combobox member-search" id="rf-combobox-${id}">
        <label class="rf-combobox-label" for="rf-combobox-${id}-input">${escapeHtml(label)}</label>
        <label class="search-box member-search-box rf-combobox-box">
          ${selectedPerson ? `<span class="combobox-avatar combobox-avatar-selected">${avatarHtml(selectedPerson)}</span>` : icon('search')}
          <input
            type="text"
            id="rf-combobox-${id}-input"
            placeholder="Search a family member..."
            autocomplete="off"
            value="${selectedPerson ? escapeHtml(getLabel(selectedPerson)) : ''}"
            aria-label="Search for ${escapeHtml(label)}"
            aria-expanded="false"
            aria-controls="rf-combobox-${id}-results"
            role="combobox"
          />
          <button type="button" id="rf-combobox-${id}-clear" class="member-search-clear" aria-label="Clear ${escapeHtml(label)}" ${selectedPerson ? '' : 'hidden'}>${icon('close')}</button>
        </label>
        <div class="member-search-results" id="rf-combobox-${id}-results" role="listbox" hidden></div>
      </div>
    `;
  }

  function closeResults(container) {
    state.results = [];
    state.activeIndex = -1;
    const { resultsEl, input } = getEls(container);
    if (resultsEl) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    }
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  function renderResults(container, query) {
    const { resultsEl, input } = getEls(container);
    if (!resultsEl || !input) return;

    resultsEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    if (state.results.length === 0) {
      resultsEl.innerHTML = `<div class="member-search-empty">No members found for "${escapeHtml(query.trim())}"</div>`;
      return;
    }

    resultsEl.innerHTML = state.results
      .map((entry, i) => `
        <button
          type="button"
          class="member-search-result-item combobox-result-item ${i === state.activeIndex ? 'active' : ''}"
          role="option"
          aria-selected="${i === state.activeIndex}"
          data-id="${escapeHtml(entry.id)}"
        >${optionInnerHtml(byId.get(String(entry.id)), query)}</button>
      `)
      .join('');

    resultsEl.querySelectorAll('.combobox-result-item').forEach((btn) => {
      btn.addEventListener('click', () => selectPerson(container, btn.dataset.id));
    });
  }

  function runSearch(container, query) {
    if (!query.trim()) {
      closeResults(container);
      return;
    }
    const excluded = excludeId ? String(excludeId() ?? '') : '';
    state.results = searchMembers(index, query).filter((entry) => String(entry.id) !== excluded);
    state.activeIndex = state.results.length ? 0 : -1;
    renderResults(container, query);
  }

  function moveActive(container, delta) {
    const count = state.results.length;
    if (!count) return;
    state.activeIndex = (state.activeIndex + delta + count) % count;
    container.querySelectorAll(`${sel('results')} .combobox-result-item`).forEach((el, i) => {
      el.classList.toggle('active', i === state.activeIndex);
      el.setAttribute('aria-selected', i === state.activeIndex);
      if (i === state.activeIndex) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function selectPerson(container, personId) {
    if (!personId) return;
    closeResults(container);
    state.selectedId = String(personId);
    const { input, clearBtn } = getEls(container);
    const person = byId.get(state.selectedId);
    if (input) input.value = person ? getLabel(person) : '';
    if (clearBtn) clearBtn.hidden = false;
    onSelect(state.selectedId);
  }

  function attach(container) {
    const { input, clearBtn } = getEls(container);
    if (!input || !clearBtn) return;

    input.addEventListener('focus', () => {
      input.select();
    });

    input.addEventListener('input', () => {
      clearBtn.hidden = false;
      if (state.selectedId != null) {
        state.selectedId = null;
        onSelect(null);
      }
      runSearch(container, input.value);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive(container, 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(container, -1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const target = state.results[Math.max(state.activeIndex, 0)];
        if (target) selectPerson(container, target.id);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeResults(container);
        input.blur();
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.hidden = true;
      closeResults(container);
      if (state.selectedId != null) {
        state.selectedId = null;
        onSelect(null);
      }
      input.focus();
    });
  }

  return { render, attach, getSelected: () => state.selectedId };
}
