// Stub interface for future AI-based person tagging on photos. Not wired up
// yet - real detection is out of scope until a model/provider is picked - but
// the shape is fixed now so mediaTagModel.tagMember({ source: 'ai', ... })
// has a stable producer to plug in later without a schema or API change.
//
// Expected real implementation: run face detection + recognition against a
// tree's existing tagged photos, then call tagMember for each match with
// source: 'ai' and a confidence score, leaving confirmed_at/confirmed_by null
// until a human reviews it via the media_tags confirm endpoint.
export async function suggestTagsForMedia(_mediaId) {
  return [];
}
