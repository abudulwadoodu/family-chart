// Thin wrappers over api() for the reactions endpoints
// (backend/routes/comments.js's reactionsRouter). Mirrors mediaApi.js's shape.

export function getReactions(api, treeId, targetType, targetId) {
  return api(`/api/trees/${treeId}/reactions?targetType=${targetType}&targetId=${targetId}`);
}

export function toggleReaction(api, treeId, { targetType, targetId, emoji }) {
  return api(`/api/trees/${treeId}/reactions/toggle`, {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, emoji }),
  });
}
