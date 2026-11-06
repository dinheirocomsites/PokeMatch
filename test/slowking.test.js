// Caso real reportado pelo Felipe (06/11/2026): Sharpedo × Slowking/Kangaskhan, dor "Morro para o Kyurem e depois não volto mais".
// A ferramenta tinha dado uma análise completamente errada (Black Belt, Kieran, "vitória 6×0"): não entendia que o Slowking
// usa o Trifrost do Kyurem pagando só {P}{C}, com o topo do deck escolhido por Academy at Night / Ciphermaniac's Codebreaking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const PAIN = 'Morro para o kyurem e depois nao volto mais';
const r = analyze(read('sharpedo.txt'), read('slowking.txt'), db, { limit: 10, context: PAIN });

test('Slowking ganha os ataques do topo do deck (Trifrost do Kyurem por {P}{C}) porque o deck escolhe o topo', () => {
  const opp = profileDeck(parseDeck(read('slowking.txt'), db));
  const sk = opp.entries.find((e) => e.card.name === 'Slowking').card;
  const tri = sk.attacks.find((a) => a.copiedAttack === 'Trifrost');
  assert.ok(tri, 'Slowking deveria poder usar o Trifrost');
  assert.deepEqual(tri.cost, ['Psychic', 'Colorless']);
  assert.ok(tri.stackers.includes('Academy at Night'));
});

test('a dor é explicada no topo: como o Kyurem te pega e o que cai', () => {
  const d0 = r.diagnosis[0];
  assert.match(d0, /Kyurem/);
  assert.match(d0, /Slowking/);
  assert.match(d0, /Trifrost/);
  assert.match(d0, /\{P\}\{C\}/);
  assert.match(d0, /Carvanha/);
  assert.equal(r.confidence, 'normal');
});

test('a corrida mostra o estrago antes do Sharpedo atacar (não é mais "vitória 6×0")', () => {
  const pre = r.race.naive && analyze(read('sharpedo.txt'), read('slowking.txt'), db, { context: PAIN }).race.naive.plan[0].mine;
  assert.match(pre, /Slowking ataca primeiro/);
  assert.match(pre, /Trifrost/);
  assert.doesNotMatch(r.race.naive.result, /6×0/);
});

test('as sugestões respondem ao dano no banco: Shaymin (Flower Curtain) em 1º; Black Belt não lidera', () => {
  assert.equal(r.suggestions[0].card.name, 'Shaymin');
  assert.match(r.suggestions[0].relevance, /dano no seu banco/);
  assert.notEqual(r.suggestions[0].card.name, "Black Belt's Training");
  assert.ok(r.suggestions.slice(0, 3).some((s) => s.card.name === 'Rabsca'));
});

test('detector de contradição: citar um Pokémon que (neste deck) não ataca nem é copiado gera aviso e baixa confiança', () => {
  const r2 = analyze(read('sharpedo.txt'), '4 Kyurem SFA 47\n10 Psychic Energy MEE 13', db, { limit: 3, context: 'morro para o kyurem' });
  assert.equal(r2.confidence, 'baixa');
  assert.match(r2.diagnosis[0], /não encontrei como ele causa/);
});
