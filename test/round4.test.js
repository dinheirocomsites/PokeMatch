// Rodada 4: simulador mais realista (nocaute em 2 ataques, tempo de evolução, Checkup, Boss de verdade)
// e eixos novos de diagnóstico (trava de Pokémon da mão, pressão cedo, cura, moinho, paralisia, virada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { simulateRace, checkupDamage, gustBudget, planText } from '../src/prizes.js';
import { diagnoseDisruption, counterTags } from '../src/diagnosis.js';
import { extractTags } from '../src/tags.js';
import { analyze } from '../src/engine.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const prof = (f) => profileDeck(parseDeck(read(f), db));
const sharpedo = prof('sharpedo.txt');
const zoroark = prof('zoroark.txt');
const stall = prof('rocket-stall.txt');
const card = (n) => db.cards.find((c) => c.name === n);

test('nocaute em 2 ataques: o dano fica no Pokémon dele (Zoroark 170 no Pecharunt ex, depois termina)', () => {
  const r = simulateRace(zoroark, sharpedo);
  const steps = [...r.best.steps, ...(r.alt?.steps ?? [])];
  const chip = steps.find((s) => s.chip);
  assert.ok(chip, 'deveria haver um ataque que só causa dano');
  const finish = steps.find((s) => s.target === chip.chip.target && s.had > 0);
  assert.ok(finish, 'o mesmo Pokémon deveria cair depois, contando o dano que já tinha');
  assert.ok(planText(r.best).some((p) => /fica com \d+ HP|já tinha/.test(p.mine)));
});

test('tempo de evolução: Mega Sharpedo ex (Estágio 1) deixa o oponente atacar antes no Carvanha', () => {
  const r = simulateRace(sharpedo, zoroark, { only: ['Mega Sharpedo ex'] });
  const pre = r.best.steps[0].pre;
  assert.ok(pre);
  assert.equal(pre.target, 'Carvanha');
  assert.ok(pre.ko);
  assert.match(planText(r.best)[0].mine, /só ataca no seu 2º turno/);
});

test('Checkup: veneno garantido conta 10; efeito com moeda não conta', () => {
  const vile = card('Vileplume');
  const pollen = vile.attacks.find((a) => a.name === 'Pollen Bomb');
  assert.equal(checkupDamage(pollen, vile, card('Carvanha'), stall).dmg, 10);
  const ekans = card("Team Rocket's Ekans");
  assert.equal(checkupDamage(ekans.attacks.find((a) => a.name === 'Drag Down'), ekans, card('Carvanha'), stall).dmg, 0);
});

test('Boss de verdade: moeda vale meio; Giovanni sem Pokémon da Equipe Rocket não conta', () => {
  assert.equal(gustBudget(sharpedo), 2); // 4 Boss's Orders
  assert.equal(gustBudget({ entries: [{ card: card('Pokémon Catcher'), count: 4 }] }), 1);
  assert.equal(gustBudget({ entries: [{ card: card("Team Rocket's Giovanni"), count: 4 }] }), 0);
});

test('Team Rocket\'s Arbok: trava Pokémon com Habilidade vindos da mão (exceto Equipe Rocket)', () => {
  const t = extractTags(card("Team Rocket's Arbok")).find((x) => x.kind === 'HAND_PKMN_LOCK');
  assert.ok(t);
  assert.equal(t.exceptOwner, 'Team Rocket');
  assert.ok(t.cond.includes('active'));
});

test('eixos novos contra um deck de trava/stall: Arbok, paralisia/sono e virada (Briar)', () => {
  const d = diagnoseDisruption(sharpedo, stall);
  const keys = d.axes.map((a) => a.key);
  for (const k of ['pokemon_lock', 'status_lock', 'comeback']) assert.ok(keys.includes(k), k);
  assert.ok(d.tips.some((x) => /2 prêmios restantes/.test(x)));
  assert.ok(d.tips.some((x) => /só vale com ele no Ativo/.test(x)));
});

test('cura de condição: Pokémon Center Lady responde; Fóssil Antigo (só ele mesmo) não', () => {
  assert.ok(counterTags(card('Pokémon Center Lady')).some((t) => t.kind === 'STATUS_CURE'));
  assert.ok(!counterTags(card('Antique Root Fossil')).some((t) => t.kind === 'STATUS_CURE'));
});

test('pressão cedo usa só o dano base no começo (Lillie\'s Clefairy ex não conta banco cheio)', () => {
  const d = diagnoseDisruption(sharpedo, prof('basic-box.txt'));
  const sp = d.axes.find((a) => a.key === 'speed');
  assert.ok(!sp || !/Lillie's Clefairy ex/.test(sp.evidence));
});

test('pedido "dificultar a vida dele" contra Dragapult: o Arbok trava a evolução para Drakloak', () => {
  const r = analyze(read('sharpedo.txt'), read('dragapult.txt'), db, { limit: 12, context: 'quero dificultar a vida dele' });
  const a = r.suggestions.find((s) => s.card.name === "Team Rocket's Arbok");
  assert.ok(a, 'Arbok deveria aparecer');
  assert.match(a.relevance, /Habilidade vindos da mão/);
  assert.ok(a.reasons.some((x) => /Drakloak/.test(x.why)));
});

test('moinho: Hippowdon descarta o topo do seu deck e a ferramenta sugere recuperação', () => {
  const hippo = profileDeck(parseDeck('4 Hippopotas POR 39\n4 Hippowdon POR 40\n10 Fighting Energy MEE 6', db));
  const d = diagnoseDisruption(sharpedo, hippo);
  const mill = d.axes.find((a) => a.key === 'mill');
  assert.ok(mill);
  assert.match(mill.evidence, /Hippowdon/);
  assert.ok(counterTags(card('Energy Recycler')).some((t) => t.kind === 'DECK_RECOVERY'));
});
