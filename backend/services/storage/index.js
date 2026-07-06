// Storage provider abstraction. Routes/models only ever import from here, never
// from a concrete provider file - swapping local disk for S3 later (per
// terraform/, there's no media bucket yet) means changing STORAGE_PROVIDER
// and implementing the same four functions, not touching any calling code.
//
// There's no storeGetObjectUrl: URLs are routed through this app's own
// auth-checked /api/trees/:treeId/media/:mediaId/file endpoint (built by the
// caller from mediaId), not a direct storage URL - that stays true whether
// the provider is local disk or a private S3 bucket later.
import { putObject, getObjectStream, deleteObject } from './localDiskStorage.js';

export async function storePutObject(key, buffer, mimeType) {
  return putObject(key, buffer, mimeType);
}

export async function storeGetObjectStream(key) {
  return getObjectStream(key);
}

export async function storeDeleteObject(key) {
  return deleteObject(key);
}
