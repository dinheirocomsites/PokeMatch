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
  assert.match(t2, /nocauteia Teal Mask Ogerpon ex sem precisar de Boss/);
  assert.doesNotMatch(r.race.best.plan.map((t) => t.mine).join(' '), /Yveltal/);
  for (const m of plan.filter((x) => /Boss's Orders/.test(x))) assert.match(m, /Ele só vale|Ele não cai/, 'todo Boss precisa de justificativa');
});

test('feedback: todo passo do plano diz quem está no Ativo do oponente', () => {
  const r = analyze(read('sharpedo.txt'), read('basic-box.txt'), db);
  for (const t of r.race.best.plan) assert.match(t.mine, /^Ativo dele: /);
});
