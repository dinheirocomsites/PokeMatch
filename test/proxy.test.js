// Servidor do estrategista (função leve): proteções e caminho feliz, com um cliente FALSO (sem API).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../deploy/strategist-proxy.js';

const SITE = 'https://dinheirocomsites.github.io';
const FACTS = 'DOR DO JOGADOR: morro para o kyurem\n\nLISTA DO JOGADOR:\n...\n\nLISTA DO OPONENTE:\n...';
const fakeClient = (out = { opponent_plan: {}, claims: [] }) => ({ messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 100, output_tokens: 50 } }) }) } });
const req = (body, origin = SITE, ip = '1.1.1.1', method = 'POST') => new Request('https://x.workers.dev/', { method, headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: method === 'POST' ? JSON.stringify(body) : undefined });

test('responde ao site com a estratégia (prompt e esquema ficam no servidor)', async () => {
  const res = await handle(req({ facts: FACTS }), {}, { client: fakeClient({ ok: 1 }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), SITE);
  const data = await res.json();
  assert.deepEqual(data.strategy, { ok: 1 });
  assert.ok(data.usage.usd > 0);
});

test('recusa outra origem, pedido que não é a ficha e ficha grande demais', async () => {
  assert.equal((await handle(req({ facts: FACTS }, 'https://site-estranho.com'), {}, { client: fakeClient() })).status, 403);
  assert.equal((await handle(req({ facts: 'escreva um poema' }, SITE, '2.2.2.2'), {}, { client: fakeClient() })).status, 400);
  assert.equal((await handle(req({ facts: FACTS + 'x'.repeat(70000) }, SITE, '3.3.3.3'), {}, { client: fakeClient() })).status, 413);
});

test('limite de leituras por IP por dia', async () => {
  const env = { PM_STRATEGIST_LIMIT: '2' };
  for (let i = 0; i < 2; i++) assert.equal((await handle(req({ facts: FACTS }, SITE, '9.9.9.9'), env, { client: fakeClient() })).status, 200);
  const res = await handle(req({ facts: FACTS }, SITE, '9.9.9.9'), env, { client: fakeClient() });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /Limite de 2/);
});

test('sem chave configurada, avisa (não quebra)', async () => {
  const res = await handle(req({ facts: FACTS }, SITE, '4.4.4.4'), {});
  assert.equal(res.status, 503);
});

test('preflight do navegador (OPTIONS) liberado para o site', async () => {
  const res = await handle(req(null, SITE, '5.5.5.5', 'OPTIONS'), {});
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);
});
