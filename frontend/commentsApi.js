// Thin wrappers over api() for the comments/reactions endpoints
// (backend/routes/comments.js). Mirrors mediaApi.js's shape - takes `api` as
// a parameter rather than importing frontend/api.js directly.

export function getComments(api, treeId, targetType, targetId) {
  return api(`/api/trees/${treeId}/comments?targetType=${targetType}&targetId=${targetId}`);
}

export function addComment(api, treeId, { targetType, targetId, body }) {
  return api(`/api/trees/${treeId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, body }),
  });
}

export function deleteComment(api, treeId, commentId) {
  return api(`/api/trees/${treeId}/comments/${commentId}`, { method: 'DELETE' });
}
