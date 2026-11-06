// Testes "de ouro" do cálculo de dano: cada erro encontrado vira um caso aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { damageVs } from '../src/damage.js';
import { analyze } from '../src/engine.js';

const db = loadDb();
const card = (id) => db.byId.get(id);
const byName = (n) => db.byName.get(n.toLowerCase())[0];
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const atk = (c, name) => c.attacks.find((a) => a.name === name);

test('Moltres (PFL 014): 20 + 90 contra ex, ×2 na fraqueza = 220 no Ogerpon; 20 num não-ex', () => {
  const m = card('me02-014');
  assert.equal(damageVs(atk(m, 'Fighting Wings'), m, byName('Teal Mask Ogerpon ex')).dmg, 220);
  assert.equal(damageVs(atk(m, 'Fighting Wings'), m, byName('Passimian')).dmg, 20);
});

test('Pecharunt ex: 60 por prêmio que o oponente pegou', () => {
  const p = byName('Pecharunt ex');
  assert.equal(damageVs(atk(p, 'Irritated Outburst'), p, byName('Meowth ex'), { oppTaken: 3 }).dmg, 180);
});

test('Mega Sharpedo ex: +150 só se estiver ferido; +40 de Binding Mochi antes da fraqueza', () => {
  const s = byName('Mega Sharpedo ex');
  const og = byName('Teal Mask Ogerpon ex');
  assert.equal(damageVs(atk(s, 'Hungry Jaws'), s, og).dmg, 120);
  assert.equal(damageVs(atk(s, 'Hungry Jaws'), s, og, { selfDamaged: true, bonus: 40 }).dmg, 310);
});

test('"por contador no Ativo dele" e "por Condição Especial" não inflam (alvo novo = 0)', () => {
  const bb = card('sv06-118'); // Brute Bonnet
  assert.equal(damageVs(atk(bb, 'Relentless Punches'), bb, byName('Teal Mask Ogerpon ex')).dmg, 50);
  const muk = card('sv10-124'); // Team Rocket's Muk
  assert.equal(damageVs(atk(muk, 'Hazardous Venom'), muk, byName('Teal Mask Ogerpon ex')).dmg, 0);
});

test('"Round" só conta Pokémon que têm o ataque Round (Wigglytuff MEG 077: 40×)', () => {
  const w = card('me02-077');
  assert.equal(damageVs(atk(w, 'Round'), w, byName('Meowth ex'), { deck: { entries: [] } }).dmg, 40);
});

test('cara ou coroa conta pela média; "se o Ativo já tem dano" depende do seu deck', () => {
  const flip = { damage: '30+', effect: 'Flip a coin. If heads, this attack does 40 more damage.' };
  const me = { types: ['Colorless'] };
  const tgt = { types: ['Colorless'], weaknesses: [], hp: 200 };
  assert.equal(damageVs(flip, me, tgt).dmg, 50);
  const already = { damage: '50+', effect: "If your opponent's Active Pokémon already has any damage counters on it, this attack does 80 more damage." };
  assert.equal(damageVs(already, me, tgt).dmg, 50);
  assert.equal(damageVs(already, me, tgt, { targetCounters: 3 }).dmg, 130);
});

test('Moltres é sugerido contra a Basic Box (troca de nocaute); Lugia de 3 tipos de energia não', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { limit: 20, context: 'corrida dos prêmios, morro em um hit para Ogerpon ou Folhas Férreas' });
  const m = r.suggestions.find((s) => s.card.name === 'Moltres');
  assert.ok(m, 'Moltres deveria aparecer');
  assert.equal(m.card.id, 'me02-014');
  assert.ok(m.reasons.some((x) => x.kind === 'KO_TRADE' && /Teal Mask Ogerpon ex \(220, fraqueza\)/.test(x.why)));
  assert.ok(!r.suggestions.some((s) => s.card.id === '30th-121'), 'Lugia (Fogo+Água+Elétrico) é impagável');
});
