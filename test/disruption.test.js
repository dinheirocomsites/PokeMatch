// Caso real (Felipe): Sharpedo × Dragapult com Budew, Unfair Stamp e Crushing Hammer.
// A ferramenta devolvia ZERO sugestões porque só procurava "quem mata o seu atacante".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const PAIN = 'Sofro muito quando mato budew no turno 1 ele me volta com carimbo, martelo e as vezes volta ate com budew denovo';
const run = () => analyze(read('sharpedo.txt'), read('dragapult.txt'), db, { limit: 10, context: PAIN });

test('nunca devolve zero sugestões', () => {
  assert.ok(run().suggestions.length >= 3);
});

test('diagnóstico por eixos: trava de Itens, reset da mão (Unfair Stamp após nocaute) e remoção de energia', () => {
  const r = run();
  const d = r.diagnosis.join(' ');
  assert.match(d, /Trava de Itens: Budew/);
  assert.match(d, /Unfair Stamp só pode ser usado depois que VOCÊ nocauteia/);
  assert.match(d, /Remoção de energia: Crushing Hammer/);
  assert.ok(r.tips.some((t) => /Cada nocaute que você faz libera Unfair Stamp/.test(t)));
});

test('contexto em PT entende "carimbo" e "martelo"', () => {
  const r = run();
  assert.ok(r.context.pains.includes('contra'));
  for (const n of ['Unfair Stamp', 'Crushing Hammer', 'Budew']) assert.ok(r.context.mentions.opp.includes(n), n);
});

test('sugere Supporters que buscam sem Itens (Salvatore → Mega Sharpedo, Cyrano) e respeita requisitos', () => {
  const r = run();
  const names = r.suggestions.map((s) => s.card.name);
  assert.ok(names.slice(0, 3).includes('Salvatore') && names.slice(0, 3).includes('Cyrano'), names.join(', '));
  const sal = r.suggestions.find((s) => s.card.name === 'Salvatore');
  assert.match(sal.reasons[0].why, /Mega Sharpedo ex/);
  assert.doesNotMatch(sal.reasons[0].why, /Lillie|Boss/);
  for (const n of ['Lunatone', "Rosa's Encouragement", 'Philippe', "Iono's Kilowattrel"]) assert.ok(!names.includes(n), `${n} tem requisito que o deck não cumpre`);
});
