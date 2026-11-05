// Gera dist/: versão estática (sem servidor) — o motor roda no navegador.
import { mkdir, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
const OUT = 'dist';
await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/src`, { recursive: true });
await mkdir(`${OUT}/data`, { recursive: true });
await mkdir(`${OUT}/examples`, { recursive: true });
const SKIP = new Set(['server.js', 'db.js']);
for (const f of await readdir('src')) if (f.endsWith('.js') && !SKIP.has(f)) await copyFile(`src/${f}`, `${OUT}/src/${f}`);
for (const f of await readdir('test/decks')) await copyFile(`test/decks/${f}`, `${OUT}/examples/${f}`);
// Base enxuta: só os campos que o motor usa
const raw = JSON.parse(await readFile('data/cards.json', 'utf8'));
const KEEP = ['id', 'localId', 'name', 'namePt', 'regulationMark', 'category', 'stage', 'hp', 'types', 'evolveFrom', 'suffix', 'trainerType', 'energyType', 'effect', 'retreat', 'rarity', 'image', 'abilities', 'attacks', 'weaknesses', 'resistances', 'legal', 'set', 'legalOverride'];
raw.cards = raw.cards.map((c) => Object.fromEntries(KEEP.filter((k) => c[k] !== undefined && c[k] !== null).map((k) => [k, k === 'set' ? { id: c.set.id } : c[k]])));
await writeFile(`${OUT}/data/cards.json`, JSON.stringify(raw));
let html = await readFile('public/index.html', 'utf8');
html = html.replace('<script>', '<script>window.TF_STATIC = true;</script>\n<script>');
await writeFile(`${OUT}/index.html`, html);
console.log('dist/ pronto');
