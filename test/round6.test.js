// Rodada 6: famílias que mudam o cálculo — retaliação, aguentar com HP cheio, tirar o Ativo dele,
// habilidade que se nocauteia, evolução do oponente, cópia do ataque dele, veneno forte, buscas genéricas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { extractTags } from '../src/tags.js';
import { damageVs } from '../src/damage.js';
import { checkupDamage, drawbackOf } from '../src/prizes.js';
import { diagnoseDisruption, disruptionValue } from '../src/diagnosis.js';
import { genericSearch } from '../src/consistency.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const prof = (f) => profileDeck(parseDeck(read(f), db));
const sharpedo = prof('sharpedo.txt');
const card = (n, f = () => true) => db.unique.find((c) => c.name === n && f(c));
const tag = (c, k) => extractTags(c).find((t) => t.kind === k);

test('retaliação: Iron Jugulis devolve 30 em contadores em quem o ataca', () => {
  const t = tag(card('Iron Jugulis', (c) => /Attacking Pokémon/.test(c.text)), 'RETALIATE');
  assert.equal(t?.amount, 30);
});

test('aguenta com HP cheio: Pikachu ex não cai de um ataque só', () => {
  assert.ok(tag(card('Pikachu ex', (c) => /full HP/.test(c.text)), 'SURVIVE_FULL'));
});

test('tirar o Ativo dele responde à trava do Arbok (Equipe Rocket)', () => {
  const d = diagnoseDisruption(sharpedo, prof('rocket-stall.txt'));
  const fs = card('Hippopotas', (c) => /switch out your opponent/i.test(c.text));
  assert.ok(tag(fs, 'FORCE_SWITCH'));
  assert.ok(disruptionValue(fs, d, sharpedo).some((r) => r.axis === 'pokemon_lock'));
});

test('habilidade que nocauteia o próprio Pokémon é marcada (dá prêmio)', () => {
  assert.ok(tag(card('Dusknoir', (c) => /this Pokémon is Knocked Out/i.test(c.text)), 'SELF_KO'));
});

test('evolução do oponente: Bronzong trava, Ampharos da Equipe Rocket pune, Espathra desfaz', () => {
  assert.ok(tag(card('Bronzong', (c) => /to evolve their Pokémon/i.test(c.text)), 'EVOLVE_LOCK'));
  assert.equal(tag(card("Team Rocket's Ampharos"), 'EVOLVE_PUNISH')?.amount, 40);
  assert.ok(tag(card('Espathra', (c) => /Devolve/i.test(c.text)), 'DEVOLVE'));
});

test('cópia do ataque dele: Zoroark (Foul Play) usa o Phantom Dive do Dragapult ex', () => {
  const z = card('Zoroark', (c) => c.attacks.some((a) => a.name === 'Foul Play'));
  const r = damageVs(z.attacks.find((a) => a.name === 'Foul Play'), z, card('Dragapult ex'), {});
  assert.equal(r.dmg, 200);
});

test('veneno forte: "2 contadores no Checkup em vez de 1" vira 20', () => {
  const a = { effect: "Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 2 damage counters on that Pokémon instead of 1." };
  assert.equal(checkupDamage(a, { name: 'X' }, card('Carvanha'), { entries: [] }).dmg, 20);
});

test('trava o ataque escolhido ("that Pokémon can\'t use that attack") conta como trava do Defensor', () => {
  assert.equal(drawbackOf({ effect: "Choose 1 of your opponent's Active Pokémon's attacks. During your opponent's next turn, that Pokémon can't use that attack." }).lockDefender, true);
});

test('busca genérica entra na simulação de mão: energia {L}, qualquer carta, Evolução', () => {
  assert.ok(genericSearch('Search your deck for up to 2 Basic {L} Energy cards, reveal them')({ category: 'Energy', isBasicEnergy: true, name: 'Lightning Energy' }));
  assert.ok(genericSearch('Search your deck for a card and put it into your hand.')({ category: 'Trainer' }));
  const evo = genericSearch('Search your deck for an Evolution Pokémon, reveal it');
  assert.ok(evo({ category: 'Pokemon', stage: 'Stage1' }) && !evo({ category: 'Pokemon', stage: 'Basic' }));
});

test('régua da rodada 6: pelo menos 85% lido e 78% usado', () => {
  const cov = JSON.parse(execFileSync('node', ['scripts/audit-coverage.js', '--json'], { cwd: new URL('../', import.meta.url), maxBuffer: 1 << 24 }).toString());
  assert.ok(cov.pct.lido >= 85, `lido ${cov.pct.lido}%`);
  assert.ok(cov.pct.usado >= 78, `usado ${cov.pct.usado}%`);
});

test('simulador: retaliação do Iron Jugulis machuca o Sharpedo; Pikachu ex aguenta o 1º ataque com HP cheio', async () => {
  const { simulateRace, planText } = await import('../src/prizes.js');
  const jug = profileDeck(parseDeck('4 Iron Jugulis TEF 139\n10 Darkness Energy TK5Z 3', db));
  const r1 = simulateRace(sharpedo, jug, { only: ['Mega Sharpedo ex'] });
  assert.ok(r1.best.steps.some((s) => s.theirRetaliate?.amount === 30));
  const pika = profileDeck(parseDeck('4 Pikachu ex SSP 57\n10 Lightning Energy TK9P 2', db));
  const r2 = simulateRace(sharpedo, pika, { only: ['Mega Sharpedo ex'] });
  assert.ok(r2.best.steps[0].chip?.sturdy);
  assert.match(planText(r2.best)[0].mine, /aguenta com 10 HP/);
});

test('simulador sempre termina: oponente sem Pokémon (ou sem conseguir atacar) fecha o jogo', async () => {
  const { simulateRace } = await import('../src/prizes.js');
  const pika = profileDeck(parseDeck('4 Pikachu ex SSP 57\n10 Lightning Energy TK9P 2', db));
  const r = simulateRace(sharpedo, pika, { only: ['Mega Sharpedo ex'] });
  assert.ok(r.best && r.best.win);
});
