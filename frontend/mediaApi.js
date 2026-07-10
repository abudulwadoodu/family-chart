// Thin wrappers over api() for the media/albums/events endpoints
// (backend/routes/media.js, albums.js, events.js). Takes `api` as a
// parameter rather than importing frontend/api.js directly, mirroring
// csvImportPanel.js/gedcomWizard.js - keeps these functions swappable/testable
// independent of the real fetch-based client.

export function listMedia(api, treeId, { kind, memberId } = {}) {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (memberId) params.set('memberId', memberId);
  const qs = params.toString();
  return api(`/api/trees/${treeId}/media${qs ? `?${qs}` : ''}`);
}

export function uploadMedia(api, treeId, { file, kind, title, description, takenAt, visibility, shareUserIds }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', kind);
  if (title) formData.append('title', title);
  if (description) formData.append('description', description);
  if (takenAt) formData.append('takenAt', takenAt);
  if (visibility) formData.append('visibility', visibility);
  if (shareUserIds) formData.append('shareUserIds', JSON.stringify(shareUserIds));
  return api(`/api/trees/${treeId}/media`, { method: 'POST', body: formData });
}

export function updateMedia(api, treeId, mediaId, { title, description, takenAt, visibility, shareUserIds }) {
  const body = { title, description, takenAt };
  if (visibility !== undefined) {
    body.visibility = visibility;
    body.shareUserIds = shareUserIds;
  }
  return api(`/api/trees/${treeId}/media/${mediaId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteMedia(api, treeId, mediaId) {
  return api(`/api/trees/${treeId}/media/${mediaId}`, { method: 'DELETE' });
}

export function getMediaUsage(api, treeId, mediaId) {
  return api(`/api/trees/${treeId}/media/${mediaId}/usage`);
}

export function listTags(api, treeId, mediaId) {
  return api(`/api/trees/${treeId}/media/${mediaId}/tags`);
}

export function tagMember(api, treeId, mediaId, { memberId, box }) {
  return api(`/api/trees/${treeId}/media/${mediaId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ memberId, box }),
  });
}

export function removeTag(api, treeId, mediaId, tagId) {
  return api(`/api/trees/${treeId}/media/${mediaId}/tags/${tagId}`, { method: 'DELETE' });
}

export function listAlbums(api, treeId) {
  return api(`/api/trees/${treeId}/albums`);
}

export function createAlbum(api, treeId, { name, description }) {
  return api(`/api/trees/${treeId}/albums`, { method: 'POST', body: JSON.stringify({ name, description }) });
}

export function getAlbum(api, treeId, albumId) {
  return api(`/api/trees/${treeId}/albums/${albumId}`);
}

export function updateAlbum(api, treeId, albumId, { name, description }) {
  return api(`/api/trees/${treeId}/albums/${albumId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, description }),
  });
}

export function addMediaToAlbum(api, treeId, albumId, mediaId, sortOrder) {
  return api(`/api/trees/${treeId}/albums/${albumId}/media`, {
    method: 'POST',
    body: JSON.stringify({ mediaId, sortOrder }),
  });
}

export function removeMediaFromAlbum(api, treeId, albumId, mediaId) {
  return api(`/api/trees/${treeId}/albums/${albumId}/media/${mediaId}`, { method: 'DELETE' });
}

export function setAlbumCover(api, treeId, albumId, mediaId) {
  return api(`/api/trees/${treeId}/albums/${albumId}/cover`, {
    method: 'PATCH',
    body: JSON.stringify({ mediaId }),
  });
}

export function deleteAlbum(api, treeId, albumId) {
  return api(`/api/trees/${treeId}/albums/${albumId}`, { method: 'DELETE' });
}

export function listEvents(api, treeId, { memberId } = {}) {
  const qs = memberId ? `?memberId=${encodeURIComponent(memberId)}` : '';
  return api(`/api/trees/${treeId}/events${qs}`);
}

export function createEvent(api, treeId, { title, eventType, description, eventDate, datePrecision, location, visibility, shareUserIds }) {
  const body = { title, eventType, description, eventDate, datePrecision, location };
  if (visibility !== undefined) {
    body.visibility = visibility;
    body.shareUserIds = shareUserIds;
  }
  return api(`/api/trees/${treeId}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getEvent(api, treeId, eventId) {
  return api(`/api/trees/${treeId}/events/${eventId}`);
}

export function updateEvent(api, treeId, eventId, { title, eventType, description, eventDate, datePrecision, location, visibility, shareUserIds }) {
  const body = { title, eventType, description, eventDate, datePrecision, location };
  if (visibility !== undefined) {
    body.visibility = visibility;
    body.shareUserIds = shareUserIds;
  }
  return api(`/api/trees/${treeId}/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function addParticipant(api, treeId, eventId, { memberId, role }) {
  return api(`/api/trees/${treeId}/events/${eventId}/participants`, {
    method: 'POST',
    body: JSON.stringify({ memberId, role }),
  });
}

export function removeParticipant(api, treeId, eventId, memberId) {
  return api(`/api/trees/${treeId}/events/${eventId}/participants/${encodeURIComponent(memberId)}`, {
    method: 'DELETE',
  });
}

export function attachMediaToEvent(api, treeId, eventId, mediaId) {
  return api(`/api/trees/${treeId}/events/${eventId}/media`, {
    method: 'POST',
    body: JSON.stringify({ mediaId }),
  });
}

export function detachMediaFromEvent(api, treeId, eventId, mediaId) {
  return api(`/api/trees/${treeId}/events/${eventId}/media/${mediaId}`, { method: 'DELETE' });
}

export function deleteEvent(api, treeId, eventId) {
  return api(`/api/trees/${treeId}/events/${eventId}`, { method: 'DELETE' });
}

export function listCollaborators(api, treeId) {
  return api(`/api/trees/${treeId}/permissions`);
}
