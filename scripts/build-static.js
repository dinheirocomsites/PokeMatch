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
// Efeitos lidos pela IA (se existirem): só o que o motor usa
try {
  const llm = JSON.parse(await readFile('data/llm-effects.json', 'utf8'));
  raw.llm = { items: Object.fromEntries(Object.entries(llm.items ?? {}).filter(([, it]) => it.effects?.length || it.summary_pt).map(([k, it]) => [k, { card: it.card, block: it.block, sentence: it.sentence, effects: it.effects, summary_pt: it.summary_pt }])) };
} catch { /* sem efeitos da IA ainda */ }
await writeFile(`${OUT}/data/cards.json`, JSON.stringify(raw));
// Pacotes de imagens (gerados por scripts/pack-images.py), se existirem
try {
  await mkdir(`${OUT}/img`, { recursive: true });
  for (const f of await readdir('data/img')) await copyFile(`data/img/${f}`, `${OUT}/img/${f}`);
} catch { console.log('(sem pacotes de imagens — rode scripts/pack-images.py)'); }
let html = await readFile('public/index.html', 'utf8');
html = html.replace('<script>', '<script>window.TF_STATIC = true;</script>\n<script>');
await writeFile(`${OUT}/index.html`, html);
console.log('dist/ pronto');
