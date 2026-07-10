// Shared by media.js and events.js POST/PATCH handlers: parses and
// validates the `visibility`/`shareUserIds` fields a client can send when
// creating or editing a media item or event. Rejects (rather than silently
// dropping) any shareUserIds entry that isn't an actual tree_permissions
// member of this tree, since a silently-dropped id could make the sharer
// believe someone has access who doesn't.
import { query } from '../db/index.js';

export function parseVisibilityInput(body) {
  const visibility = body?.visibility === 'private' ? 'private' : 'tree';
  let shareUserIds = [];
  if (visibility === 'private' && body?.shareUserIds !== undefined) {
    const raw = typeof body.shareUserIds === 'string' ? JSON.parse(body.shareUserIds) : body.shareUserIds;
    if (!Array.isArray(raw)) throw new VisibilityInputError('shareUserIds must be an array');
    shareUserIds = raw.map(Number).filter((id) => Number.isInteger(id));
  }
  return { visibility, shareUserIds };
}

export class VisibilityInputError extends Error {}

// Throws VisibilityInputError if any id in shareUserIds isn't a
// tree_permissions member of treeId.
export async function validateShareUserIds(treeId, shareUserIds) {
  if (!shareUserIds.length) return;
  const { rows } = await query('SELECT user_id FROM tree_permissions WHERE tree_id = $1 AND user_id = ANY($2)', [
    treeId,
    shareUserIds,
  ]);
  const validIds = new Set(rows.map((row) => row.user_id));
  const invalid = shareUserIds.filter((id) => !validIds.has(id));
  if (invalid.length) {
    throw new VisibilityInputError(`shareUserIds contains users without access to this tree: ${invalid.join(', ')}`);
  }
}
