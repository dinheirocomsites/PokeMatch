// Auditoria de cobertura do TEXTO das cartas legais, em 3 níveis:
//   lido    — alguma parte da ferramenta reconhece a frase (etiqueta, regra, requisito, dano)
//   usado   — o que foi reconhecido muda a nota, o diagnóstico ou a simulação
//   testado — a carta aparece num teste ou numa lista de teste
// Frases de ligação ("Once during your turn, you may use this Ability.") e pedaços que dependem da frase
// anterior ("If you do, …", "prevent that damage.") contam junto com o efeito a que pertencem.
// Uso: npm run audit:coverage   ·   DECKS=1 (só cartas das listas de teste)   ·   --json (resumo para testes)
import { readFileSync, readdirSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';

const db = loadDb();
const root = new URL('../', import.meta.url);
const DECK_FILES = readdirSync(new URL('test/decks/', root)).filter((f) => f.endsWith('.txt'));
const DECK_NAMES = new Set(DECK_FILES.flatMap((f) => parseDeck(readFileSync(new URL(`test/decks/${f}`, root), 'utf8'), db).cards.filter((e) => e.card).map((e) => e.card.name)));
const TEST_TEXT = readdirSync(new URL('test/', root)).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(`test/${f}`, root), 'utf8')).join('\n');
const tested = (name) => DECK_NAMES.has(name) || (name.length >= 4 && (TEST_TEXT.includes(name) || TEST_TEXT.includes(name.replace(/'/g, "\\'"))));

import { auditCoverage } from '../src/coverage.js';
const { stats, fam } = auditCoverage(db, { only: process.env.DECKS ? DECK_NAMES : null, tested, examples: process.env.DECKS ? 12 : 4 });
const pct = (n) => Math.round((n / stats.total) * 100);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...stats, pct: { lido: pct(stats.lido), usado: pct(stats.usado), testado: pct(stats.testado), viaIa: pct(stats.viaIa) }, families: Object.fromEntries([...fam].map(([k, v]) => [k, v.n])) }));
} else {
  console.log(`Frases de efeito${process.env.DECKS ? ' (cartas das listas de teste)' : ' nas cartas legais'}: ${stats.total}`);
  console.log(`  lido    (alguma parte reconhece): ${stats.lido} (${pct(stats.lido)}%)`);
  console.log(`  usado   (muda nota/diagnóstico/simulação): ${stats.usado} (${pct(stats.usado)}%)`);
  console.log(`  testado (usado e com teste da carta): ${stats.testado} (${pct(stats.testado)}%)`);
  if (stats.viaIa) console.log(`  (destes, lidos pela IA e conferidos pelo motor: ${stats.viaIa})`);
  console.log(`Não entendidas: ${stats.total - stats.lido}\n`);
  for (const [f, e] of [...fam.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`${String(e.n).padStart(4)} frases · ${String(e.cards.size).padStart(3)} cartas — ${f}`);
    e.ex.forEach((x) => console.log(`        ex.: ${x}`));
  }
}
