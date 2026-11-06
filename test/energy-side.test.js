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
