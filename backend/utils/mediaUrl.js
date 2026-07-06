// Shared by media.js, albums.js, and events.js - anywhere a media row is
// sent to the client needs this attached, since the DB row itself only has
// storage_key (an internal detail) and no public URL. Built from
// tree_id/id (not the raw storage key) so the URL stays behind the media
// route's own tree-role check regardless of storage provider.
export function fileUrlFor(media) {
  return `/api/trees/${media.tree_id}/media/${media.id}/file`;
}

export function withMediaUrls(items) {
  return items.map((item) => ({ ...item, url: fileUrlFor(item) }));
}
