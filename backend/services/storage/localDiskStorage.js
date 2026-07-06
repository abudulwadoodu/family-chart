import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_ROOT = process.env.MEDIA_STORAGE_PATH || path.resolve(__dirname, '../../../data/media');

function resolveSafePath(key) {
  const resolved = path.resolve(MEDIA_ROOT, key);
  if (!resolved.startsWith(MEDIA_ROOT)) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

export async function putObject(key, buffer, _mimeType) {
  const filePath = resolveSafePath(key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return { key };
}

export async function getObjectStream(key) {
  const filePath = resolveSafePath(key);
  return fs.createReadStream(filePath);
}

export async function deleteObject(key) {
  const filePath = resolveSafePath(key);
  fs.rmSync(filePath, { force: true });
}
