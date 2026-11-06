// Pokémon de Treinador (N's, Hop's/Lupo, Team Rocket's/Equipe Rocket, Cynthia's/Cíntia…):
// cartas que só funcionam com Pokémon do mesmo dono, buscas restritas, bônus de grupo e cópia de ataque.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { requirements } from '../src/diagnosis.js';
import { extractTags, ownerSearches, ownerSearchFinds, copyAttackOf } from '../src/tags.js';
import { damageVs } from '../src/damage.js';
import { analyze } from '../src/engine.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const sharpedo = profileDeck(parseDeck(read('sharpedo.txt'), db));
const zoroark = profileDeck(parseDeck(read('zoroark.txt'), db));
const card = (n) => db.byName.get(n.toLowerCase())[0];

test('dono vem do nome: N\'s Zoroark ex → N; Team Rocket\'s Mewtwo ex → Team Rocket; Treinador não tem dono', () => {
  assert.equal(card("N's Zoroark ex").owner, 'N');
  assert.equal(card("Team Rocket's Mewtwo ex").owner, 'Team Rocket');
  assert.equal(card("Hop's Snorlax").owner, 'Hop');
  assert.equal(card("Team Rocket's Petrel").owner, null); // Supporter com nome de dono não é "Pokémon de"
  assert.deepEqual(zoroark.owners, { N: 14 });
});

test('Team Rocket\'s Mewtwo ex não ataca sem 4 Pokémon da Equipe Rocket em jogo — bloqueado no Sharpedo', () => {
  const r = requirements(card("Team Rocket's Mewtwo ex"), sharpedo);
  assert.equal(r.ok, false);
  assert.match(r.note, /4\+ Pokémon de Equipe Rocket/);
});

test('apoio de dono sem Pokémon desse dono é bloqueado (Hop\'s Bag, N\'s PP Up, Team Rocket\'s Energy)', () => {
  for (const n of ["Hop's Bag", "N's PP Up", "Team Rocket's Energy", "Team Rocket's Proton", "Team Rocket's Giovanni"]) {
    const r = requirements(card(n), sharpedo);
    assert.equal(r.ok, false, n);
  }
  // no deck de N, o N's PP Up funciona e diz com quem combina
  const ok = requirements(card("N's PP Up"), zoroark);
  assert.equal(ok.ok, true);
  assert.ok(ok.good.some((g) => /Pokémon de N/.test(g)));
});

test('"instead": só o bônus depende do dono (Arven\'s Sandwich cura 30 em qualquer um)', () => {
  const r = requirements(card("Arven's Sandwich"), sharpedo);
  assert.equal(r.ok, true);
  assert.ok(r.factor >= 0.8);
});

test('Estádio dos dois jogadores: N\'s Castle no Sharpedo contra o N\'s Zoroark ajuda só o oponente', () => {
  const r = requirements(card("N's Castle"), sharpedo, zoroark);
  assert.equal(r.ok, true);
  assert.ok(r.factor <= 0.3);
  assert.match(r.note, /ajuda só o oponente/);
});

test('Night Joker precisa de OUTRO Pokémon de N no banco: sozinho o efeito cai', () => {
  const r = requirements(card("N's Zoroark ex"), sharpedo);
  assert.ok(r.factor < 0.5);
  assert.match(r.note, /Night Joker/);
});

test('busca restrita ao dono: Hop\'s Bag acha Básico de Hop, não Carvanha', () => {
  const s = ownerSearches(card("Hop's Bag").text);
  assert.ok(ownerSearchFinds(s, card("Hop's Wooloo")));
  assert.ok(!ownerSearchFinds(s, card('Carvanha')));
  assert.ok(!ownerSearchFinds(s, card("Hop's Dubwool"))); // Estágio 1
});

test('bônus de grupo: Hop\'s Snorlax e Postwick dão +30 só para Pokémon de Hop', () => {
  for (const n of ["Hop's Snorlax", 'Postwick']) {
    const t = extractTags(card(n)).find((x) => x.kind === 'EXTRA_DMG');
    assert.equal(t.ownerFor, 'Hop', n);
    assert.equal(t.amount, 30);
  }
  assert.equal(extractTags(card('Postwick')).find((x) => x.kind === 'EXTRA_DMG').both, true);
});

test('dano por contagem de dono: Team Rocket\'s Spidops conta só Pokémon da Equipe Rocket', () => {
  const sp = card("Team Rocket's Spidops");
  const atk = sp.attacks.find((a) => a.name === 'Rocket Rush');
  const target = card('Carvanha');
  // no Sharpedo só o próprio Spidops conta → 30
  assert.equal(damageVs(atk, sp, target, { deck: sharpedo }).dmg, 30);
});

test('N\'s Zoroark ex copia os ataques do banco pagando {D}{D} (Virtuous Flame 170)', () => {
  const z = zoroark.entries.find((e) => e.card.name === "N's Zoroark ex").card;
  assert.ok(copyAttackOf(z.attacks.find((a) => a.name === 'Night Joker')));
  const vf = z.attacks.find((a) => a.copiedAttack === 'Virtuous Flame');
  assert.ok(vf);
  assert.deepEqual(vf.cost, ['Darkness', 'Darkness']);
  assert.equal(zoroark.mainAttacker.name, "N's Zoroark ex");
});

test('tech do mesmo dono vira ataque do copiador: N\'s Zekrom no N\'s Zoroark contra o Sharpedo', () => {
  const r = analyze(read('zoroark.txt'), read('sharpedo.txt'), db, { limit: 12 });
  const z = r.suggestions.find((s) => s.card.name === "N's Zekrom");
  assert.ok(z, 'N\'s Zekrom deveria aparecer como fonte de cópia');
  const why = z.reasons.find((x) => x.kind === 'COPY_SOURCE').why;
  assert.match(why, /Rampaging Thunder/);
  assert.match(why, /\{D\}\{D\}/);
  // e o Sharpedo não recebe sugestões que dependem de Pokémon de N
  const r2 = analyze(read('sharpedo.txt'), read('zoroark.txt'), db, { limit: 12 });
  assert.ok(!r2.suggestions.some((s) => ["N's PP Up", "N's Castle", 'Anthea & Concordia'].includes(s.card.name)));
});
