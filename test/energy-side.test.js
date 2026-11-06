// "Para cada Energia …" tem LADO e TIPO; e o motor não pode quebrar quando nenhum atacante consegue jogar.
// Caso real (Felipe): espelho do Sharpedo sugeriu Diancie com "240 + 30 = 270" — o Diffuse Reflection conta
// Energias ESPECIAIS ligadas aos Pokémon DO OPONENTE, e a lista dele só tem Darkness Energy básica (dano real: 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { damageVs } from '../src/damage.js';
import { simulateRace } from '../src/prizes.js';

const db = loadDb();
const deckText = (n) => readFileSync(new URL(`./decks/${n}.txt`, import.meta.url), 'utf8');
const prof = (n) => profileDeck(parseDeck(deckText(n), db));
const card = (name, re) => (db.byName.get(name.toLowerCase()) ?? []).find((c) => re.test(c.text ?? ''));
const atk = (c, name) => c.attacks.find((a) => a.name === name);

test('Diffuse Reflection (Diancie): conta Energia ESPECIAL do OPONENTE — 0 contra quem só joga Energia básica', () => {
  const diancie = card('Diancie', /Diffuse Reflection/);
  const sharpedo = prof('sharpedo'); // 9 Darkness Energy, nenhuma Especial
  const slowking = prof('slowking'); // 4 Telepathic Psychic + 2 Boomerang (Especiais)
  const pech = sharpedo.entries.find((e) => e.card.name === 'Pecharunt ex').card;
  const kanga = slowking.entries.find((e) => /Kangaskhan/.test(e.card.name)).card;
  assert.equal(damageVs(atk(diancie, 'Diffuse Reflection'), diancie, pech, { deck: sharpedo, defDeck: sharpedo }).dmg, 0);
  const vsSlow = damageVs(atk(diancie, 'Diffuse Reflection'), diancie, kanga, { deck: sharpedo, defDeck: slowking }).dmg;
  assert.ok(vsSlow > 0 && vsSlow < 240, `contra quem joga Especiais conta poucas na mesa (deu ${vsSlow})`);
});

test('espelho do Sharpedo: não sugere Diancie (nem "270 de dano")', () => {
  const t = deckText('sharpedo');
  const r = analyze(t, t, db, { limit: 12, context: 'GOSTARIA DE TER ALGUMA VANTAGEM NA MIRROR MATCH' });
  assert.ok(!r.suggestions.some((s) => s.card.name === 'Diancie'), r.suggestions.map((s) => s.card.name).join(', '));
});

test('energia {X} DESTE Pokémon: Gatling Tar (Coalossal) sem Energia {R} no deck é só o dano base', () => {
  const coal = card('Coalossal', /Gatling Tar/);
  const target = prof('zoroark').entries.find((e) => e.card.category === 'Pokemon').card;
  const semFogo = damageVs(atk(coal, 'Gatling Tar'), coal, target, { deck: prof('slowking') }).dmg;
  const comFogo = damageVs(atk(coal, 'Gatling Tar'), coal, target, { deck: prof('zoroark') }).dmg; // 6 Fire Energy
  assert.ok(semFogo < comFogo, `${semFogo} deveria ser menor que ${comFogo}`);
  assert.ok(semFogo <= 80, `sem {R} no deck, ${semFogo} é dano inventado`);
  // a energia nova que vem no pacote da própria tech conta
  const pacote = damageVs(atk(coal, 'Gatling Tar'), coal, target, { deck: prof('slowking'), energyTypes: new Set(['Psychic', 'Fighting', 'Fire']) }).dmg;
  assert.ok(pacote > semFogo);
});

test('energia {X} do OPONENTE: Sunflora conta só o que o deck dele joga', () => {
  const sun = card('Sunflora', /Redirected Sunlight/);
  const me = prof('sharpedo');
  const t = (p) => p.entries.find((e) => e.card.category === 'Pokemon').card;
  assert.equal(damageVs(atk(sun, 'Redirected Sunlight'), sun, t(me), { deck: me, defDeck: me }).dmg, 0); // sem Fire
  const zor = prof('zoroark'); // 6 Fire em 15 energias → ~1 ligada
  const d = damageVs(atk(sun, 'Redirected Sunlight'), sun, t(zor), { deck: me, defDeck: zor }).dmg;
  assert.ok(d > 0 && d < 180, `deu ${d}`);
  // deck do defensor desconhecido: mantém a estimativa antiga (não zera por falta de informação)
  assert.ok(damageVs(atk(sun, 'Redirected Sunlight'), sun, t(zor), { deck: me }).dmg >= 180);
});

test('motor não quebra quando nenhum atacante consegue jogar (antes: 18 de 36 confrontos de teste travavam)', () => {
  for (const [a, b] of [['slowking', 'sharpedo'], ['basic-box', 'zoroark'], ['rocket-stall', 'rocket-stall'], ['zoroark', 'rocket-stall']]) {
    const r = analyze(deckText(a), deckText(b), db, { limit: 5 });
    assert.ok(Array.isArray(r.suggestions), `${a} vs ${b}`);
  }
  // simulação só com um atacante que não ataca: fecha a linha em vez de devolver nada
  const me = prof('slowking');
  const r = simulateRace(me, prof('sharpedo'), { only: ['nenhum-atacante'] });
  assert.ok(r.best, 'a simulação precisa devolver uma linha');
  assert.equal(r.best.win, false);
});

test('banco do oponente: Combat Thunder (Zeraora) conta o banco que ele costuma ter, não sempre 5, e explica a conta', async () => {
  const { benchEstimate } = await import('../src/damage.js');
  const z = card('Zeraora', /Combat Thunder/);
  const sk = (db.byName.get('mega skarmory ex') ?? [])[0];
  const opp = prof('sharpedo');
  const n = benchEstimate(opp);
  assert.ok(n >= 3 && n <= 5, `banco estimado ${n}`);
  const r = damageVs(atk(z, 'Combat Thunder'), z, sk, { defDeck: opp });
  assert.equal(r.dmg, (20 + 20 * n) * 2); // ×2 só porque o Mega Skarmory ex é fraco a Elétrico
  assert.ok(r.notes.some((x) => x.includes(`~${n} Pokémon no banco dele`)), r.notes.join('; '));
  assert.ok(r.notes.includes('fraqueza'));
});

test('"este ataque não faz nada": Ceruledge sem 4 Energias {R} para descartar da mão = 0; moeda = metade', async () => {
  const { nothingFactor } = await import('../src/damage.js');
  const ce = card('Ceruledge', /Infernal Slash/);
  const ex = (db.byName.get('mega excadrill ex') ?? [])[0];
  assert.equal(damageVs(atk(ce, 'Infernal Slash'), ce, ex, { deck: prof('sharpedo') }).dmg, 0);
  const fire = { entries: [], counts: { energy: 12, basicEnergy: 12 }, energyByType: { Fire: 12 } };
  assert.equal(damageVs(atk(ce, 'Infernal Slash'), ce, ex, { deck: fire }).dmg, 440); // deck de Fogo de verdade: funciona (fraqueza)
  assert.equal(nothingFactor('Flip a coin. If tails, this attack does nothing.').p, 0.5);
  assert.equal(nothingFactor("If your opponent's Active Pokémon isn't a Pokémon ex, this attack does nothing.", null, { isEx: false }).p, 0);
});

test('foco no atacante principal (Felipe × Mega Excadrill ex): nada de tech que só nocauteia Drilbur/Beldum', () => {
  const r = analyze(deckText('sharpedo'), deckText('excadrill'), db, { limit: 10 });
  const names = r.suggestions.map((s) => s.card.name);
  for (const n of ['Zoroark', 'Purugly', 'Tranquill', 'Ceruledge']) assert.ok(!names.includes(n), `${n} não deveria aparecer: ${names.join(', ')}`);
  const bb = r.suggestions.find((s) => s.card.name === "Black Belt's Training");
  assert.ok(bb, names.join(', '));
  assert.match(bb.reasons[0].why, /Mega Excadrill ex.*fecha os 340 HP/);
  // todo atacante sugerido diz o que faz contra o principal
  for (const s of r.suggestions.filter((x) => x.card.category === 'Pokemon' && x.pkg?.damage)) assert.ok(s.reasons.some((x) => x.kind === 'MAIN_FOCUS' && /Mega Excadrill ex/.test(x.why)), s.card.name);
});

test('foco: o que você cita na dor também é o alvo (Moltres derruba Ogerpon e Iron Leaves e fica no topo)', () => {
  const r = analyze(deckText('sharpedo'), deckText('basic-box'), db, { limit: 30, context: 'corrida dos prêmios, morro em um hit para Ogerpon ou Folhas Férreas' });
  const m = r.suggestions.find((s) => s.card.name === 'Moltres');
  assert.ok(m.reasons.some((x) => x.kind === 'MAIN_FOCUS' && /Iron Leaves ex/.test(x.why)), m.reasons.map((x) => x.why).join(' | '));
});
