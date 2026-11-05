// Carrega a base local de cartas (Node). A lógica fica em db-core.js (também usada no navegador).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDb } from './db-core.js';
export { normName, BASIC_ENERGY, buildDb } from './db-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let cache;
export function loadDb(path = join(ROOT, 'data', 'cards.json')) {
  if (!cache) cache = buildDb(JSON.parse(readFileSync(path, 'utf8')));
  return cache;
}
