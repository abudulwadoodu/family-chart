import { icon } from '../../icons.js';
import { escapeHtml } from '../../utils.js';
import { ADMIN_NAV_ITEMS } from './nav.js';
import { hasPermission } from './permissions.js';

// ---------------------------------------------------------------------------
// Breadcrumb - `crumbs` is [{ id, label }, ...] for every ancestor level
// (each rendered as a clickable link with a matching `data-breadcrumb-id`
// for the caller to wire), followed by the current page as plain text.
// ---------------------------------------------------------------------------
export function renderAdminBreadcrumb({ crumbs, current }) {
  const links = crumbs
    .map((crumb) => `<button type="button" class="breadcrumb-link" data-breadcrumb-id="${escapeHtml(crumb.id)}">${escapeHtml(crumb.label)}</button><span class="breadcrumb-sep">/</span>`)
    .join('');
  return `
    <nav class="breadcrumb admin-breadcrumb" aria-label="Breadcrumb">
      ${links}<span class="breadcrumb-current">${escapeHtml(current)}</span>
    </nav>
  `;
}

// ---------------------------------------------------------------------------
// Admin shell - sidebar-within-a-sidebar nav for the admin section, plus the
// content slot. `user` decides which nav items are visible per role.
// ---------------------------------------------------------------------------
export function renderAdminShellMarkup({ section, content, user }) {
  const navButtons = ADMIN_NAV_ITEMS.filter((item) => hasPermission(user, item.permission))
    .map(
      (item) => `
    <button type="button" class="admin-nav-item ${section === item.id ? 'admin-nav-item-active' : ''}" data-admin-section="${item.id}">
      <span>${escapeHtml(item.label)}</span>
    </button>`
    )
    .join('');

  return `
    <div class="admin-shell">
      <nav class="admin-nav" aria-label="Admin">${navButtons}</nav>
      <div class="admin-content">${content}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Data Table - resource-agnostic role="table" grid. `columns` is
// [{ label, width? }] and each row in `rows` is pre-rendered HTML cells
// (an array of strings) so callers keep full control over cell markup
// (badges, links, formatting) without this component knowing about any
// specific resource.
//
// Pass `startIndex` (1-based position of the first row on the current page,
// e.g. `(page - 1) * pageSize + 1`) to prepend a narrow "#" serial-number
// column - omit it to leave the table as-is.
// ---------------------------------------------------------------------------
export function renderDataTable({ columns, rows, rowKeys, onRowClickAttr = 'data-row-id', className = '', emptyMessage = 'No results found.', loading, startIndex }) {
  if (loading) return '<p class="muted admin-table-empty">Loading&hellip;</p>';
  if (!rows.length) return `<p class="muted admin-table-empty">${escapeHtml(emptyMessage)}</p>`;

  const showIndex = typeof startIndex === 'number';
  const allColumns = showIndex ? [{ label: '#', width: 'narrow' }, ...columns] : columns;
  const gridStyle = `grid-template-columns: ${allColumns.map((col) => (col.width === 'narrow' ? '48px' : 'minmax(0, 1fr)')).join(' ')};`;
  const head = allColumns
    .map((col, i) => `<span class="${showIndex && i === 0 ? 'admin-table-index-cell' : ''}">${escapeHtml(col.label)}</span>`)
    .join('');
  const body = rows
    .map((cells, i) => {
      const cellsHtml = cells.map((cell) => `<span class="admin-table-cell">${cell}</span>`).join('');
      const indexCellHtml = showIndex ? `<span class="admin-table-cell admin-table-index-cell muted">${startIndex + i}</span>` : '';
      return `
    <button type="button" class="admin-table-row ${className}" style="${gridStyle}" ${onRowClickAttr}="${escapeHtml(String(rowKeys[i]))}">
      ${indexCellHtml}${cellsHtml}
    </button>`;
    })
    .join('');

  return `
    <div class="admin-table" role="table">
      <div class="admin-table-head" role="row" style="${gridStyle}">${head}</div>
      ${body}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Search Bar
// ---------------------------------------------------------------------------
export function renderSearchBar({ idPrefix, placeholder = 'Search...', value = '' }) {
  return `
    <label class="search-box admin-search-box">
      ${icon('search')}
      <input type="search" id="${idPrefix}-search-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" />
    </label>
  `;
}

// ---------------------------------------------------------------------------
// Filter Panel - `filters` is [{ id, options: [{value,label}], value }].
// Renders one <select> per filter, all sharing the idPrefix convention
// `${idPrefix}-${filter.id}-select` so attach-listener code can predict IDs.
// ---------------------------------------------------------------------------
export function renderFilterPanel({ idPrefix, filters }) {
  return `
    <div class="admin-filter-panel">
      ${filters
        .map((filter) => {
          const options = filter.options
            .map((opt) => `<option value="${escapeHtml(opt.value)}" ${filter.value === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`)
            .join('');
          return `<select id="${idPrefix}-${filter.id}-select" class="admin-filter-select" aria-label="${escapeHtml(filter.label || filter.id)}">${options}</select>`;
        })
        .join('')}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Pagination - numbered, with Prev/Next. Caller passes total/page/pageSize;
// this only renders markup, all page-change handling stays in each module's
// logic.js (keeps this component free of any resource-specific loadX call).
// ---------------------------------------------------------------------------
export function renderPagination({ page, pageSize, total, idPrefix }) {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const pageNumbers = [];
  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, windowStart + 4);
  for (let p = windowStart; p <= windowEnd; p += 1) pageNumbers.push(p);

  const numberButtons = pageNumbers
    .map(
      (p) => `<button type="button" class="btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'} admin-page-number-btn" data-page="${p}" ${p === page ? 'disabled' : ''}>${p}</button>`
    )
    .join('');

  return `
    <div class="admin-pagination">
      <span class="admin-pagination-label">Page ${page} of ${totalPages} &middot; ${total} result${total === 1 ? '' : 's'}</span>
      <div class="admin-pagination-actions">
        <button type="button" id="${idPrefix}-prev-btn" class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        ${numberButtons}
        <button type="button" id="${idPrefix}-next-btn" class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Status Badge - generic label/variant renderer, e.g.
// renderStatusBadge('active', { active: 'Active', suspended: 'Suspended' }, 'status')
// produces class="badge badge-status-active".
// ---------------------------------------------------------------------------
export function renderStatusBadge(value, labelMap = {}, variantPrefix = 'status') {
  const label = labelMap[value] || value;
  return `<span class="badge badge-${variantPrefix}-${String(value).toLowerCase()}">${escapeHtml(label)}</span>`;
}

// ---------------------------------------------------------------------------
// Empty / Loading / Error states - generic versions (the ones in
// frontend/components.js are hardcoded to the My Trees page copy).
// ---------------------------------------------------------------------------
export function renderAdminEmptyState({ title = 'Nothing here yet', description = '', iconName = 'search' }) {
  return `
    <div class="empty-state admin-empty-state">
      <div class="empty-state-icon">${icon(iconName)}</div>
      <h2 class="empty-state-title">${escapeHtml(title)}</h2>
      ${description ? `<p class="empty-state-desc">${escapeHtml(description)}</p>` : ''}
    </div>
  `;
}

export function renderAdminLoadingState({ label = 'Loading' } = {}) {
  return `<p class="muted admin-loading-state">${escapeHtml(label)}&hellip;</p>`;
}

export function renderAdminErrorState({ message = 'Something went wrong.', retryId = 'admin-retry-btn' } = {}) {
  return `
    <div class="empty-state admin-error-state">
      <div class="empty-state-icon">${icon('close')}</div>
      <h2 class="empty-state-title">Could not load this page</h2>
      <p class="empty-state-desc">${escapeHtml(message)}</p>
      <div class="empty-state-actions">
        <button type="button" id="${retryId}" class="btn btn-secondary">Try again</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Stat Card - for Dashboard's stat grid. Pass `sectionTarget` (an
// ADMIN_NAV_ITEMS id) to make the card a link into that admin section;
// omit it for purely informational metrics with no dedicated page.
// `filterKey`/`filterValue` (optional) are applied to that section's state
// before it loads, so the drilldown list matches the number on the card
// instead of showing everything.
// ---------------------------------------------------------------------------
export function renderStatCard({ label, value, iconName, hint, sectionTarget, filterKey, filterValue }) {
  const tag = sectionTarget ? 'button' : 'div';
  const attrs = sectionTarget
    ? `type="button" data-stat-card-target="${escapeHtml(sectionTarget)}" ${filterKey ? `data-stat-card-filter-key="${escapeHtml(filterKey)}" data-stat-card-filter-value="${escapeHtml(filterValue)}"` : ''}`
    : '';
  return `
    <${tag} class="card admin-stat-card ${sectionTarget ? 'admin-stat-card-clickable' : ''}" ${attrs}>
      ${iconName ? `<div class="admin-stat-card-icon">${icon(iconName)}</div>` : ''}
      <p class="admin-stat-value">${escapeHtml(String(value))}</p>
      <p class="admin-stat-label">${escapeHtml(label)}</p>
      ${hint ? `<p class="admin-stat-hint muted">${escapeHtml(hint)}</p>` : ''}
    </${tag}>
  `;
}

// ---------------------------------------------------------------------------
// Setting Field - drives the Settings page from SETTINGS_SCHEMA entries.
// ---------------------------------------------------------------------------
export function renderSettingField({ type, settingKey, label, value, options = [], disabled }) {
  const fieldId = `admin-setting-${settingKey}`;
  const disabledAttr = disabled ? 'disabled' : '';

  let control;
  if (type === 'boolean') {
    control = `
      <label class="admin-setting-toggle">
        <input type="checkbox" id="${fieldId}" data-setting-key="${settingKey}" ${value ? 'checked' : ''} ${disabledAttr} />
        <span class="admin-setting-toggle-track"></span>
      </label>
    `;
  } else if (type === 'select') {
    const optionsHtml = options
      .map((opt) => `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
      .join('');
    control = `<select id="${fieldId}" data-setting-key="${settingKey}" ${disabledAttr}>${optionsHtml}</select>`;
  } else if (type === 'number') {
    control = `<input type="number" id="${fieldId}" data-setting-key="${settingKey}" value="${escapeHtml(String(value))}" ${disabledAttr} />`;
  } else {
    control = `<input type="text" id="${fieldId}" data-setting-key="${settingKey}" value="${escapeHtml(String(value))}" ${disabledAttr} />`;
  }

  return `
    <div class="admin-setting-field">
      <label for="${fieldId}" class="admin-setting-label">${escapeHtml(label)}</label>
      ${control}
    </div>
  `;
}
