import { api } from '../../api.js';
import { showToast } from '../../ui.js';

export function createSettingsState() {
  return { schema: {}, values: {}, loading: false, error: '', saving: false };
}

export async function loadSettings(state, render) {
  state.admin.settings.loading = true;
  state.admin.settings.error = '';
  render();
  try {
    const payload = await api('/api/admin/settings');
    state.admin.settings.schema = payload.schema;
    state.admin.settings.values = payload.values;
  } catch (error) {
    state.admin.settings.error = error.message || 'Could not load settings.';
  } finally {
    state.admin.settings.loading = false;
    render();
  }
}

export function attachSettingsListeners(state, render) {
  document.querySelector('#admin-settings-retry-btn')?.addEventListener('click', () => loadSettings(state, render));

  const form = document.querySelector('#admin-settings-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const updates = {};
    Object.entries(state.admin.settings.schema).forEach(([key, def]) => {
      const field = form.querySelector(`[data-setting-key="${key}"]`);
      if (!field) return;
      if (def.type === 'boolean') updates[key] = field.checked;
      else if (def.type === 'number') updates[key] = Number(field.value);
      else updates[key] = field.value;
    });

    state.admin.settings.saving = true;
    render();
    try {
      const payload = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(updates) });
      state.admin.settings.values = payload.values;
      showToast('Settings saved.');
    } catch (error) {
      showToast(error.message || 'Could not save settings.', { type: 'error' });
    } finally {
      state.admin.settings.saving = false;
      render();
    }
  });
}
