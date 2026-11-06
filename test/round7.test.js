// Rodada 7: camada de IA (classificação na sincronização) — esquema, validador, cache, uso no motor e na auditoria.
// ATENÇÃO: as respostas abaixo são FIXTURES escritas à mão para testar o caminho; não são saídas reais da IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadDb, buildDb } from '../src/db.js';
import { KINDS, RESPONSE_SCHEMA, validateEffect, effectKey, ingest } from '../src/llm-effects.js';
import { auditCoverage } from '../src/coverage.js';
import { extractTags } from '../src/tags.js';

const db = loadDb();
const root = new URL('../', import.meta.url);

test('esquema: só tipos que o motor usa; objetos fechados; poucos campos com união de tipos', () => {
  const eff = RESPONSE_SCHEMA.properties.items.items.properties.effects.items;
  assert.deepEqual(eff.properties.kind.enum, Object.keys(KINDS));
  assert.equal(eff.additionalProperties, false);
  assert.equal(RESPONSE_SCHEMA.properties.items.items.additionalProperties, false);
  // a API recusa enum com null misturado a tipo-lista: o esquema não usa null nem união de tipos
  const unions = Object.values(eff.properties).filter((p) => Array.isArray(p.type) || p.anyOf).length;
  assert.equal(unions, 0);
  for (const p of Object.values(eff.properties)) if (p.enum) assert.ok(p.enum.every((v) => typeof v === 'string'));
  // "vazio" (0 / "" / "none") é aceito e vira ausente
  const v = validateEffect('Flip a coin. If heads, this attack does 60 more damage.', { kind: 'EXTRA_DMG', amount: 60, target: '', status: 'none', scope: 'none', conditions: [] });
  assert.equal(v.ok, true);
  assert.equal(v.effect.target, undefined);
});

test('validador: aceita o que o texto diz e recusa número inventado, tipo errado e condição trocada', () => {
  const s = "At the end of your opponent's next turn, put 9 damage counters on the Defending Pokémon.";
  const ok = validateEffect(s, { kind: 'PLACE_COUNTERS', amount: 90, target: null, status: null, scope: 'active', conditions: [] });
  assert.equal(ok.ok, true);
  assert.equal(ok.effect.amount, 90);
  assert.equal(validateEffect(s, { kind: 'PLACE_COUNTERS', amount: 120, conditions: [] }).ok, false); // 120 não está no texto
  assert.equal(validateEffect(s, { kind: 'HEAL', amount: 90, conditions: [] }).ok, false); // a frase não fala de cura
  assert.equal(validateEffect(s, { kind: 'MAGIC', conditions: [] }).ok, false);
  assert.equal(validateEffect("The Defending Pokémon is now Asleep.", { kind: 'STATUS', status: 'burned', conditions: [] }).ok, false);
  // moeda no texto entra como condição mesmo se a resposta esquecer
  const coin = validateEffect('Flip a coin. If heads, this attack does 60 more damage.', { kind: 'EXTRA_DMG', amount: 60, conditions: [] });
  assert.ok(coin.effect.cond.includes('coin'));
});

test('cache: efeito válido entra, inválido fica registrado com o motivo, id desconhecido é ignorado', () => {
  const cache = { items: {} };
  const s = "At the end of your opponent's next turn, put 9 damage counters on the Defending Pokémon.";
  const batch = [{ key: 'k1', card: 'Glaceon', block: 'Frost Bullet', sentence: s }];
  const fixture = { items: [
    { id: 'k1', summary_pt: 'No fim do turno dele, o Defensor leva 9 contadores.', effects: [{ kind: 'PLACE_COUNTERS', amount: 90, target: null, status: null, scope: 'active', conditions: [] }, { kind: 'HEAL', amount: 30, target: null, status: null, scope: null, conditions: [] }] },
    { id: 'nao-pedido', summary_pt: 'x', effects: [] },
  ] };
  const r = ingest(cache, batch, fixture, 'teste', '2026-11-06');
  assert.deepEqual(r, { ok: 1, rejected: 1 });
  assert.equal(cache.items.k1.effects[0].kind, 'PLACE_COUNTERS');
  assert.match(cache.items.k1.rejected[0].why, /cura/);
  assert.equal(Object.keys(cache.items).length, 1);
});

test('motor: efeito conferido vira etiqueta "via IA" na carta e sai da lista de não entendidas', () => {
  // base só com as regras (sem data/llm-effects.json), para o teste não depender do que a IA já leu
  const rulesOnly = buildDb(JSON.parse(readFileSync(new URL('data/cards.json', root), 'utf8')));
  const u = auditCoverage(rulesOnly).unread.find((x) => /put 9 damage counters on the Defending/i.test(x.sentence));
  assert.ok(u, 'frase de teste deveria estar entre as não entendidas pelas regras');
  const key = effectKey(u.card, u.block, u.sentence);
  const raw = JSON.parse(readFileSync(new URL('data/cards.json', root), 'utf8'));
  raw.llm = { items: { [key]: { card: u.card, block: u.block, sentence: u.sentence, summary_pt: 'fixture de teste', effects: [{ kind: 'PLACE_COUNTERS', amount: 90, cond: [], scope: 'active' }] } } };
  const db2 = buildDb(raw);
  const card = db2.unique.find((c) => c.name === u.card && (c.llm ?? []).length);
  const t = extractTags(card).find((x) => x.via === 'ia');
  assert.equal(t?.kind, 'PLACE_COUNTERS');
  assert.equal(t.amount, 90);
  const cov = auditCoverage(db2);
  assert.ok(cov.stats.viaIa >= 1);
  assert.ok(!cov.unread.some((x) => x.sentence === u.sentence && x.card === u.card));
});

test('sem chave da API o classificador não faz nada e não quebra a sincronização', () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const before = existsSync(new URL('data/llm-effects.json', root));
  const out = execFileSync('node', ['scripts/llm-classify.js'], { cwd: root, env, maxBuffer: 1 << 24 }).toString();
  assert.match(out, /Sem ANTHROPIC_API_KEY|a classificar agora: 0/);
  assert.equal(existsSync(new URL('data/llm-effects.json', root)), before);
});
