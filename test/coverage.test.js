import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { readContext } from '../src/context.js';
import { profileDeck } from '../src/profile.js';
import { analyze } from '../src/engine.js';
const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const me = profileDeck(parseDeck(read('sharpedo.txt'), db));
const opp = profileDeck(parseDeck(read('basic-box.txt'), db));

test('lista com nome em português ("Folhas Férreas ex")', () => {
  const r = parseDeck('1 Folhas Férreas ex TEF 25', db);
  assert.equal(r.cards[0].card?.name, 'Iron Leaves ex');
});

test('contexto: negação anula a dor; inglês e gírias são entendidos', () => {
  assert.ok(!readContext('não é problema a corrida de prêmios', me, opp, db).pains.includes('premios'));
  assert.ok(readContext('my Sharpedo gets KO and I lose the prize trade', me, opp, db).pains.includes('premios'));
  assert.ok(readContext('sofro com item lock e spread', me, opp, db).pains.includes('contra'));
});

test('arquétipo provável do oponente', () => {
  const r = analyze(read('sharpedo.txt'), read('dragapult.txt'), db, { limit: 3 });
  assert.match(r.opp.archetype, /Dragapult/);
});

test('consistência conta habilidades de compra e buscas por Pokémon', async () => {
  const { simulateConsistency } = await import('../src/consistency.js');
  const drakDeck = profileDeck(parseDeck(read('dragapult.txt'), db));
  const goal = [{ key: 'line', label: 'Dreepy→Drakloak→Dragapult', turn: 3, needs: ['Dreepy', 'Drakloak', 'Dragapult ex'] }];
  const r = simulateConsistency(drakDeck.entries, goal, { trials: 2000 });
  assert.ok(r.goals[0].pct > 30, `${r.goals[0].pct}%`);
});
