import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { isLegalMark } from '../src/config.js';
import { SHARPEDO } from './fixtures.js';

const db = loadDb();

test('marca H em diante é legal', () => {
  assert.equal(isLegalMark('G'), false);
  for (const m of ['H', 'I', 'J', 'K', 'j']) assert.equal(isLegalMark(m), true);
});

test('lista Sharpedo é lida com 60 cartas e sem erros', () => {
  const r = parseDeck(SHARPEDO, db);
  assert.equal(r.total, 60);
  assert.deepEqual(r.errors, []);
  assert.ok(r.cards.find((e) => e.card.name === 'Mega Sharpedo ex').card.isMega);
});

test('carta rotacionada (marca G) é apontada', () => {
  const r = parseDeck('4 Iono PAL 185', db);
  assert.ok(r.errors.some((e) => e.includes('Iono')));
});

test('impressão antiga é aceita se há reimpressão legal (Ultra Ball SVI)', () => {
  const r = parseDeck('4 Ultra Ball SVI 196', db);
  assert.equal(r.cards[0].card?.name, 'Ultra Ball');
});

test('mais de 4 cópias e 2 ACE SPEC são apontados', () => {
  const r = parseDeck('5 Ultra Ball MEG 131\n1 Prime Catcher TEF 157\n1 Master Ball TEF 153', db);
  assert.ok(r.errors.some((e) => e.includes('máximo 4')));
  assert.ok(r.errors.some((e) => e.includes('ACE SPEC')));
});
