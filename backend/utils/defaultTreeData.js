import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Same starter dataset as examples/create-tree.html (examples/data/data-first-node.json).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_JSON_PATH = path.resolve(__dirname, '../../examples/data/data-first-node.json');

export function getDefaultTreeDataJson() {
  return fs.readFileSync(DEFAULT_JSON_PATH, 'utf8');
}
