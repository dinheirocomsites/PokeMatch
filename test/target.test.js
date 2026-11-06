// Alvo de cada efeito (em QUEM e ONDE). Caso que motivou: Dragon Elixir ("Heal 60 damage from your Active {N} Pokémon")
// aparecia como resposta ao dano no banco do Slowking, num deck Sharpedo cujo único Dragão é o Tatsugiri (que fica no banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { requirements } from '../src/diagnosis.js';
import { analyze } from '../src/engine.js';
import { parseTarget, describeTarget, matchesTarget } from '../src/target.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const prof = (f) => profileDeck(parseDeck(read(f), db));
const sharpedo = prof('sharpedo.txt');
const card = (n) => db.unique.find((c) => c.name === n);

test('leitor de alvo: Ativo, banco, tipo, Rule Box, dono, quem tem a Ferramenta, ele mesmo', () => {
  const t = (s) => describeTarget(parseTarget(s));
  assert.equal(t('Heal 60 damage from your Active {N} Pokémon.'), 'Pokémon Dragão no Ativo');
  assert.equal(t('Heal 100 damage from each of your Benched Pokémon.'), 'Pokémon no banco');
  assert.equal(t("Prevent all damage done to your Benched Pokémon that don't have a Rule Box by attacks."), 'Pokémon sem Rule Box no banco');
  assert.equal(t("The Cynthia's Pokémon this card is attached to gets +70 HP."), 'Pokémon de Cynthia (o que tiver a carta)');
  assert.equal(t('Heal 20 damage from this Pokémon.'), 'Pokémon (só ele mesmo)');
  assert.equal(parseTarget("Attacks used by your opponent's Active Pokémon do 30 less damage."), null); // alvo do oponente não é seu
  assert.ok(matchesTarget(parseTarget('Heal 60 damage from your Active {N} Pokémon.'), card('Dragapult ex')));
  assert.ok(!matchesTarget(parseTarget('Heal 60 damage from your Active {N} Pokémon.'), card('Mega Sharpedo ex')));
});

test('Dragon Elixir: quase inútil no Sharpedo (o único Dragão fica no banco), inteiro no Dragapult (cura o atacante)', () => {
  const r1 = requirements(card('Dragon Elixir'), sharpedo);
  assert.ok(r1.factor <= 0.3);
  assert.match(r1.note, /Ativo.*Tatsugiri/);
  assert.equal(requirements(card('Dragon Elixir'), prof('dragapult.txt')).factor, 1);
});

test('contra o Trifrost (banco morre de um golpe), cura não é resposta; protetor de banco é', () => {
  const r = analyze(read('sharpedo.txt'), read('slowking.txt'), db, { limit: 10, context: 'Morro para o kyurem e depois nao volto mais' });
  const names = r.suggestions.map((s) => s.card.name);
  for (const n of ['Dragon Elixir', 'Super Potion', 'Fennel']) assert.ok(!names.includes(n), n);
  assert.equal(names[0], 'Shaymin');
});

test('apoio que só serve a um tipo que o deck não tem é bloqueado (Magnetic Metal Energy no Sharpedo)', () => {
  assert.equal(requirements(card('Magnetic Metal Energy'), sharpedo).ok, false);
});

test('Ferramenta de HP: Hero\'s Cape serve no Sharpedo; a de Cynthia não', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { limit: 15 });
  assert.ok(r.suggestions.some((s) => s.card.name === "Hero's Cape"));
  assert.ok(!r.suggestions.some((s) => s.card.name === "Cynthia's Power Weight"));
});
