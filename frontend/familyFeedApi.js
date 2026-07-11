export function listFeed(api, treeId) {
  return api(`/api/trees/${treeId}/activity`);
}
