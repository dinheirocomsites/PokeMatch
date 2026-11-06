// Carrega a base local de cartas (Node). A lógica fica em db-core.js (também usada no navegador).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDb } from './db-core.js';
export { normName, BASIC_ENERGY, buildDb } from './db-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let cache;
export function loadDb(path = join(ROOT, 'data', 'cards.json')) {
  if (!cache) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const llmPath = join(dirname(path), 'llm-effects.json');
    if (!raw.llm && existsSync(llmPath)) raw.llm = JSON.parse(readFileSync(llmPath, 'utf8'));
    cache = buildDb(raw);
  }
  return cache;
}
