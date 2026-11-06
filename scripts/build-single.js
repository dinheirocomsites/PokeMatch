// Gera dist-single/pokematch.html: UM arquivo com o site, o motor, a base de cartas e os exemplos.
// Funciona em qualquer hospedagem (Lovable, Netlify, Vercel, GitHub Pages) ou abrindo direto no navegador.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';

const OUT = 'dist-single';
await mkdir(OUT, { recursive: true });

const bundle = await build({ entryPoints: ['src/browser-entry.js'], bundle: true, format: 'iife', minify: true, write: false, platform: 'browser', target: 'es2020' });
const engineJs = bundle.outputFiles[0].text;

// Base enxuta (mesmos campos do site estático)
const raw = JSON.parse(await readFile('data/cards.json', 'utf8'));
const KEEP = ['id', 'localId', 'name', 'namePt', 'regulationMark', 'category', 'stage', 'hp', 'types', 'evolveFrom', 'suffix', 'trainerType', 'energyType', 'effect', 'retreat', 'rarity', 'image', 'abilities', 'attacks', 'weaknesses', 'resistances', 'legal', 'set', 'legalOverride'];
raw.cards = raw.cards.map((c) => Object.fromEntries(KEEP.filter((k) => c[k] !== undefined && c[k] !== null).map((k) => [k, k === 'set' ? { id: c.set.id } : c[k]])));

const examples = {};
for (const f of await readdir('test/decks')) examples[f] = await readFile(`test/decks/${f}`, 'utf8');

// JSON dentro de <script>: escapa "</" para não fechar a tag
const safe = (obj) => JSON.stringify(obj).replace(/<\//g, '<\\/');

let html = await readFile('public/index.html', 'utf8');
// Função como substituição: o código minificado contém "$&", "$'"… que replace() trataria como padrões especiais
const inject = `<script>window.TF_STATIC = true; window.TF_INLINE = true;
window.POKEMATCH_DATA = ${safe(raw)};
window.POKEMATCH_EXAMPLES = ${safe(examples)};
</script>
<script>${engineJs.replace(/<\/script/gi, '<\\/script')}</script>
<script>`;
html = html.replace('<script>', () => inject);
await writeFile(`${OUT}/pokematch.html`, html);
console.log(`${OUT}/pokematch.html pronto (${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB)`);
