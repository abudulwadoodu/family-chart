import { fetchAuthSession } from 'aws-amplify/auth';

import { showMaintenanceView } from './maintenanceView.js';

const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export async function getAuthHeader() {
  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
  } catch (_error) {
    return {};
  }
}

export async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const authHeader = await getAuthHeader();
  const response = await fetch(apiUrl(path), {
    headers: isFormData
      ? { ...authHeader, ...(options.headers || {}) }
      : { 'Content-Type': 'application/json', ...authHeader, ...(options.headers || {}) },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 503 && payload.status === 'maintenance') {
    showMaintenanceView();
    const error = new Error(payload.message || 'System is under maintenance. Please check back shortly.');
    error.status = 503;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return payload;
}

// For the public share-link viewer: a logged-out visitor has no Cognito
// session, so this deliberately skips getAuthHeader() entirely rather than
// relying on it silently returning {} - keeps it explicit that this path
// must never depend on auth state (see backend/routes/publicTrees.js, the
// one route this ever calls).
export async function apiPublic(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 503 && payload.status === 'maintenance') {
    showMaintenanceView();
    const error = new Error(payload.message || 'System is under maintenance. Please check back shortly.');
    error.status = 503;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

// Attachment endpoints return the raw file (not JSON), so they need their own
// fetch wrapper instead of the JSON-decoding api() helper above.
export async function fetchAttachment(path) {
  const authHeader = await getAuthHeader();
  const response = await fetch(apiUrl(path), { headers: authHeader });
  if (!response.ok) throw new Error('Could not download the attachment');

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : 'attachment';
  return { blob: await response.blob(), filename };
}
