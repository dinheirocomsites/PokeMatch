import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');

test('Sharpedo × Basic Box: Farigiraf ex é o #1 com o pacote e os combos certos', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  const f = r.suggestions[0];
  assert.equal(f.card.name, 'Farigiraf ex');
  const adds = f.pkg.adds.map((a) => a.card.id);
  assert.ok(adds.includes('sv06-083'), 'deve escolher o Girafarig TWM (Dual Headbutt)');
  assert.ok(f.pkg.adds.some((a) => a.card.name === 'Psychic Energy'), 'deve adicionar Energia Psíquica');
  assert.ok(f.pkg.unlocks.some((u) => u.name === 'Munkidori'), 'a energia também libera o Munkidori');
  const combos = f.pkg.combos.map((c) => c.with);
  for (const n of ['Pecharunt ex', 'Toxtricity', 'Munkidori', 'Binding Mochi']) assert.ok(combos.includes(n), `combo com ${n}`);
  assert.equal(f.pkg.damage.total, 230);
});

test('Crustle é penalizado: Passimian passa pela muralha e nocauteia', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { limit: 60 });
  const c = r.suggestions.find((s) => s.card.name === 'Crustle');
  assert.ok(c.notes.risco.some((n) => n.includes('Passimian') && n.includes('de uma vez')));
  assert.ok(r.suggestions.indexOf(c) > 5);
});

test('seletores que não sabemos ler não viram "qualquer Pokémon"', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { limit: 60 });
  const names = r.suggestions.map((s) => s.card.name);
  for (const n of ['Carracosta', 'Heatran', 'Rabsca']) assert.ok(!names.slice(0, 15).includes(n), n);
});

test('troca sugerida começa pela carta morta no matchup (Gravity Mountain)', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  assert.equal(r.suggestions[0].swap.out[0].name, 'Gravity Mountain');
});

test('reconhece o Watchtower como counter que o jogador já tem', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  assert.ok(r.already.some((a) => a.card.name === "Team Rocket's Watchtower"));
  assert.ok(r.locked.some((l) => l.oppCard === 'Mega Kangaskhan ex'));
  for (const s of r.suggestions) assert.ok(!s.swap.out.some((c) => c.name === "Team Rocket's Watchtower"));
});

test('não sugere muralhas que só funcionam no banco', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  const names = r.suggestions.map((s) => s.card.name);
  for (const n of ['Antique Plume Fossil', 'Poltchageist', "Misty's Magikarp"]) assert.ok(!names.includes(n));
});

test('não sugere cartas que o jogador já usa', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  assert.ok(!r.suggestions.some((s) => s.card.name === 'Munkidori'));
});
