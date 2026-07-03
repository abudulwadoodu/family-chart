import { renderSettingField, renderAdminLoadingState, renderAdminErrorState, renderAdminBreadcrumb } from '../shared/components.js';

export function renderSettingsPageMarkup({ schema, values, loading, error, saving, canEdit }) {
  if (loading) return renderAdminLoadingState({ label: 'Loading settings' });
  if (error) return renderAdminErrorState({ message: error, retryId: 'admin-settings-retry-btn' });

  const fields = Object.entries(schema)
    .map(([key, def]) => renderSettingField({ type: def.type, settingKey: key, label: def.label, value: values[key], options: def.options, disabled: !canEdit || saving }))
    .join('');

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-dashboard-breadcrumb-btn', label: 'Dashboard' }], current: 'Settings' })}
    <header class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">${canEdit ? 'System-wide configuration.' : 'System-wide configuration (view only - Super Admin required to edit).'}</p>
      </div>
    </header>
    <form id="admin-settings-form" class="card admin-settings-form">
      ${fields}
      ${canEdit ? `<button type="submit" class="btn btn-primary" ${saving ? 'disabled' : ''}>${saving ? 'Saving…' : 'Save changes'}</button>` : ''}
    </form>
  `;
}
