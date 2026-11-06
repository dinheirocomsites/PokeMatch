import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const PAIN = 'Meu problema é a corrida dos prêmios: morro em um hit para Ogerpon ou Folhas Férreas e perco 3 prêmios de uma vez, enquanto quando eu mato pego só 2';

test('Chien-Pao não ataca: a Basic Box tem 1 Energia Água e ele precisa de {W}{W}', () => {
  const opp = profileDeck(parseDeck(read('basic-box.txt'), db));
  const cp = opp.threat.find((e) => e.card.name === 'Chien-Pao');
  assert.equal(cp.feas, 0);
  assert.equal(cp.threat, 0);
});

test('corrida de prêmios: só com Sharpedo perde, na melhor ordem ganha', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  assert.equal(r.race.naive.win, false);
  assert.equal(r.race.best.win, true);
});

test('contexto em PT reconhece a dor e as cartas citadas (Folhas Férreas = Iron Leaves)', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { context: PAIN });
  assert.ok(r.context.pains.includes('premios'));
  assert.ok(r.context.mentions.opp.includes('Iron Leaves ex'));
  assert.ok(r.context.mentions.opp.includes('Teal Mask Ogerpon ex'));
  assert.equal(r.clusters[0].key, 'premios');
});

test('Legacy Energy aparece como ACE SPEC que vira a corrida jogando só com Sharpedo', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { context: PAIN, limit: 40 });
  const ace = r.clusters.find((c) => c.key === 'acespec');
  assert.equal(ace.items[0].name, 'Legacy Energy');
  const leg = r.suggestions.find((s) => s.card.name === 'Legacy Energy');
  assert.ok(leg.reasons[0].why.includes('derrota 4×6 → vitória'));
});

test('Roggenrola (só bloqueia dano até 40) não é sugerido como muralha', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { limit: 40 });
  assert.ok(!r.suggestions.some((s) => s.card.name === 'Roggenrola'));
});

// Feedback do Felipe (jogador de Sharpedo): após perder um Sharpedo (oponente com 3 prêmios),
// quem mata o Ogerpon no Ativo é o Pecharunt ex (60×3 + 30 Munkidori = 210), SEM gastar Boss.
// E o Boss só deve ser usado quando o Ativo dele não fecha a conta.
test('feedback: Pecharunt ex mata o Ogerpon do Ativo sem Boss; Boss só quando necessário', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  const plan = r.race.best.plan.map((t) => t.mine);
  const t2 = plan[1];
  assert.match(t2, /Pecharunt ex/);
  assert.match(t2, /nocauteia o Ativo dele, Teal Mask Ogerpon ex \(2 prêmios\), sem gastar Boss/);
  assert.doesNotMatch(r.race.best.plan.map((t) => t.mine).join(' '), /Yveltal/);
  for (const m of plan.filter((x) => /Boss's Orders/.test(x))) assert.match(m, /vale só|não cai/, 'todo Boss precisa de justificativa');
});

test('feedback: todo passo do plano diz o que acontece com o Ativo do oponente', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  for (const t of r.race.best.plan) assert.match(t.mine, /Ativo dele/);
});

test('feedback: o roteiro é genérico — Boss num Pokémon de 2 prêmios, com opções', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  const boss = r.race.best.plan.map((t) => t.mine).find((m) => /Boss's Orders/.test(m));
  assert.match(boss, /Boss's Orders num Pokémon de 2 prêmios que você nocauteia \(.+, .+\)/);
});

test('consistência: cada sugestão mostra o custo da troca; tirar Judge custa Supporter na mão inicial', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { context: PAIN });
  for (const s of r.suggestions) {
    assert.ok(s.consistency?.setup && s.consistency.tech, s.card.name);
    // o que importa é a tech não PIORAR o setup (um Básico a mais pode até melhorar: menos mulligan)
    assert.ok(s.consistency.setup.delta > -3, `${s.card.name} não deveria piorar o setup do Sharpedo`);
  }
  const withJudgeCut = r.suggestions.find((s) => s.swap.out.some((o) => o.name === 'Judge'));
  assert.ok(withJudgeCut.consistency.supporter.delta < -1);
});

test('Estágio 2 traz a linha inteira (Gastly → Haunter → Mega Gengar ex)', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { context: PAIN, limit: 20 });
  const g = r.suggestions.find((s) => s.card.name === 'Mega Gengar ex');
  if (g) assert.deepEqual(g.pkg.adds.map((a) => a.card.name), ['Gastly', 'Haunter', 'Mega Gengar ex']);
});

test('Ferramenta de HP: Hero\'s Cape faz o Sharpedo aguentar Ogerpon/Iron Leaves; Cynthia\'s Power Weight (só Pokémon de Cynthia) não entra', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db, { limit: 15, context: PAIN });
  const cape = r.suggestions.find((s) => s.card.name === "Hero's Cape");
  assert.ok(cape && /sobreviver/.test(cape.relevance));
  assert.ok(Object.values(cape.notes).flat().some((n) => /concorre com 3x Binding Mochi/.test(n)), 'conflito de Ferramenta');
  assert.ok(!r.suggestions.some((s) => s.card.name === "Cynthia's Power Weight"));
});

test('simulador × Dragapult: Budew abre no Ativo, Dragapult (Estágio 2) só no 2º turno, e o dano espalhado conta prêmio', () => {
  const r = analyze(read('sharpedo.txt'), read('dragapult.txt'), db, { limit: 5 });
  const plan = r.race.best.plan;
  assert.match(plan[0].mine, /vale só 1 prêmio|Budew/);
  assert.doesNotMatch(plan[0].theirs, /Dragapult ex nocauteia/);
  assert.ok(plan.some((t) => /espalha 60 no seu banco/.test(t.theirs)));
});
