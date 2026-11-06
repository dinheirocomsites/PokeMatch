// Rodada 5: régua de cobertura honesta (lido/usado/testado) + leitor genérico de condições de dano,
// contadores, ataque que puxa, proteção e trava do próprio ataque, requisito "descarte X para usar".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadDb } from '../src/db.js';
import { cleanText } from '../src/db-core.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { damageVs, condProb } from '../src/damage.js';
import { drawbackOf } from '../src/prizes.js';
import { requirements } from '../src/diagnosis.js';
import { extractTags } from '../src/tags.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const sharpedo = profileDeck(parseDeck(read('sharpedo.txt'), db));
const card = (n, f = () => true) => db.unique.find((c) => c.name === n && f(c));
const atk = (c, n) => c.attacks.find((a) => a.name === n);
const pult = card('Dragapult ex');

test('texto limpo: sem HTML da API; símbolo de energia vira {L}', () => {
  assert.equal(db.cards.filter((c) => /<[a-z/]/i.test(c.text)).length, 0);
  assert.equal(cleanText('has any <span class="energy-symbol Lightning" title="Lightning">Lightning</span> Energy'), 'has any {L} Energy');
});

test('condição de energia: Galvantula +80 só se o deck tem energia {L}', () => {
  const isIt = (a) => /has any \{L\} energy attached, this attack does 80 more/i.test(a.effect ?? '');
  const g = card('Galvantula', (c) => c.attacks.some(isIt));
  const a = g.attacks.find(isIt);
  const base = parseInt(a.damage, 10);
  assert.equal(damageVs(a, g, pult, { deck: sharpedo }).dmg, base);
  assert.equal(damageVs(a, g, pult, { deck: { energyByType: { Lightning: 8 }, entries: [], counts: {} } }).dmg, base + 80);
});

test('Estádio em jogo: Vivillon +60 com os Estádios do Sharpedo', () => {
  const v = card('Vivillon', (c) => c.attacks.some((a) => /stadium is in play/i.test(a.effect ?? '')));
  const a = v.attacks.find((x) => /stadium is in play/i.test(x.effect ?? ''));
  const r = damageVs(a, v, pult, { deck: sharpedo });
  assert.equal(r.dmg, parseInt(a.damage, 10) + 60);
  assert.ok(r.notes.some((n) => /Stadium/.test(n)));
});

test('custo de recuo do alvo: Ariados conta o {C} do recuo do Dragapult ex', () => {
  const ar = card('Ariados', (c) => c.attacks.some((a) => /retreat cost/i.test(a.effect ?? '')));
  const a = ar.attacks.find((x) => /retreat cost/i.test(x.effect ?? ''));
  assert.equal(damageVs(a, ar, pult, { deck: sharpedo }).dmg, parseInt(a.damage, 10) + 30 * pult.retreat);
});

test('bônus opcional: "You may do 100 more damage" entra com a desvantagem anotada', () => {
  const cp = card('Copperajah', (c) => c.attacks.some((a) => /you may do/i.test(a.effect ?? '')));
  const a = cp.attacks.find((x) => /you may do/i.test(x.effect ?? ''));
  const r = damageVs(a, cp, pult, { deck: sharpedo });
  assert.ok(r.notes.some((n) => /opcional/.test(n)));
});

test('condição desconhecida não chuta: devolve null', () => {
  assert.equal(condProb('the moon is full', {}, pult, {}), null);
});

test('contadores não são dano: sem fraqueza nem redução', () => {
  const a = { name: 'X', damage: null, cost: [], effect: "Put 6 damage counters on your opponent's Active Pokémon." };
  const attacker = { types: ['Psychic'] };
  const r = damageVs(a, attacker, { ...pult, weaknesses: [{ type: 'Psychic' }] }, { reduction: 30 });
  assert.equal(r.dmg, 60);
  assert.ok(r.counters);
});

test('ataque que puxa: Dipplin bate 70 no novo Ativo', () => {
  const d = card('Dipplin', (c) => c.attacks.some((a) => a.name === 'Syrup Catcher'));
  assert.equal(damageVs(atk(d, 'Syrup Catcher'), d, card('Carvanha'), { deck: sharpedo }).dmg, 70);
});

test('proteção e trava do próprio ataque (simulador): Exeggutor −30; Frosmoth trava o defensor', () => {
  const ex = card('Exeggutor', (c) => c.attacks.some((a) => /takes \d+ less damage/i.test(a.effect ?? '') && !/flip/i.test(a.effect ?? '')));
  assert.ok(drawbackOf(ex.attacks.find((a) => /takes \d+ less damage/i.test(a.effect ?? ''))).shield > 0);
  const fr = card('Frosmoth', (c) => c.attacks.some((a) => /defending pok[eé]mon can.t/i.test(a.effect ?? '')));
  assert.equal(drawbackOf(fr.attacks.find((a) => /defending pok[eé]mon can.t/i.test(a.effect ?? ''))).lockDefender, true);
});

test('redução fixa de habilidade com texto entre parênteses (Tangrowth −30)', () => {
  const t = extractTags(card('Tangrowth', (c) => (c.abilities ?? []).length)).find((x) => x.kind === 'REDUCE');
  assert.equal(t?.amount, 30);
});

test('"descarte X para usar": Meowstic sem Chill Teaser Toy é bloqueado', () => {
  const r = requirements(card('Meowstic', (c) => /Chill Teaser Toy/.test(c.text)), sharpedo);
  assert.equal(r.ok, false);
  assert.match(r.note, /Chill Teaser Toy/);
});

test('régua: cobertura em 3 níveis e dano variável 100% lido', () => {
  const cov = JSON.parse(execFileSync('node', ['scripts/audit-coverage.js', '--json'], { cwd: new URL('../', import.meta.url), maxBuffer: 1 << 24 }).toString());
  assert.ok(cov.pct.lido >= 75, `lido ${cov.pct.lido}%`);
  assert.ok(cov.pct.usado >= 65, `usado ${cov.pct.usado}%`);
  const dmg = execFileSync('node', ['scripts/audit-damage.js'], { cwd: new URL('../', import.meta.url), maxBuffer: 1 << 24 }).toString();
  assert.match(dmg, /Não entendidos: 0/);
});
