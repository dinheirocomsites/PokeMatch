// Requisitos escritos nas cartas, conferidos contra o deck do jogador (e do oponente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { requirements } from '../src/diagnosis.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const me = profileDeck(parseDeck(read('sharpedo.txt'), db));
const basicBox = profileDeck(parseDeck(read('basic-box.txt'), db));
const card = (n) => db.byName.get(n.toLowerCase())[0];

test('Tera: Glass Trumpet exige Pokémon Tera — o Sharpedo não tem', () => {
  const r = requirements(card('Glass Trumpet'), me, basicBox);
  assert.equal(r.ok, false);
  assert.match(r.note, /Tera/);
});

test('Future: Iron Crown ex só turbina Pokémon Future — efeito parcial no Sharpedo', () => {
  const r = requirements(card('Iron Crown ex'), me, basicBox);
  assert.equal(r.ok, true);
  assert.ok(r.factor <= 0.5);
});

test('custo de descarte: Secret Box custa 3 cartas', () => {
  const r = requirements(card('Secret Box'), me, basicBox);
  assert.match(r.note, /descartar 3 cartas/);
  assert.ok(r.factor < 1);
});

test('"não soma": outra carta com "Flip the Script" não acrescenta (você já tem Fezandipiti ex)', () => {
  const clone = { name: 'Teste', category: 'Pokemon', text: "Flip the Script: Once during your turn, draw 3 cards. You can't use more than 1 Flip the Script Ability each turn." };
  const r = requirements(clone, me, basicBox);
  assert.ok(r.factor <= 0.3);
  assert.match(r.note, /não soma/);
});

test('tabuleiro do oponente: efeito que depende de o oponente ter Pokémon ex', () => {
  const c = { name: 'Teste', category: 'Pokemon', text: "If your opponent has any Pokémon ex in play, this Pokémon's attacks cost {C} less." };
  assert.equal(requirements(c, me, basicBox).factor, 1, 'a Basic Box tem Pokémon ex');
  const noEx = { ...basicBox, entries: basicBox.entries.filter((e) => !e.card.isEx) };
  assert.ok(requirements(c, me, noEx).factor <= 0.5, 'sem ex no oponente, o efeito cai');
});

test('tamanho da mão: Amarys depende de quantas cartas você tem', () => {
  assert.match(requirements(card('Amarys'), me, basicBox).note, /cartas na mão/);
});
