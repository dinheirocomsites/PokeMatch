import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');

test('Sharpedo × Basic Box: encontra Farigiraf ex e Crustle no top 3', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  const top3 = r.suggestions.slice(0, 3).map((s) => s.card.name);
  assert.ok(top3.includes('Farigiraf ex'), `top3 = ${top3}`);
  assert.ok(top3.includes('Crustle'), `top3 = ${top3}`);
});

test('reconhece o Watchtower como counter que o jogador já tem', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  assert.ok(r.already.some((a) => a.card.name === "Team Rocket's Watchtower"));
  assert.ok(r.locked.some((l) => l.oppCard === 'Mega Kangaskhan ex'));
  for (const s of r.suggestions) assert.ok(!s.cuts.some((c) => c.name === "Team Rocket's Watchtower"));
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
