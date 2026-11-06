// Servidor do estrategista: função LEVE que só guarda a chave e fala com o Claude.
// O motor roda no navegador (monta a ficha de fatos e confere a resposta); aqui não há motor nem base de cartas.
// Formato web padrão (Request → Response): roda no Cloudflare Workers, Deno/Supabase e Node 22.
//
// Proteções: só aceita chamadas do site (CORS), só a ficha do PokeMatch (prompt e esquema ficam AQUI, não vêm do
// navegador — ninguém usa a sua chave para outra coisa), tamanho máximo e limite de leituras por IP por dia.
// Proteção principal de custo: o limite mensal de gastos no Console da Anthropic.
import Anthropic from '@anthropic-ai/sdk';
import { requestStrategy, DEFAULT_MODEL, MAX_FACTS } from '../src/strategist-core.js';

const DEFAULT_ORIGINS = ['https://dinheirocomsites.github.io', 'http://localhost:3000'];
const perIp = new Map(); // limite "suave": por instância do servidor (o limite firme é o do Console)

function cors(origin, allowed) {
  const ok = allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.claudeusercontent\.com$/.test(origin ?? '');
  return { 'access-control-allow-origin': ok ? origin : allowed[0], 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

export async function handle(request, env = {}, deps = {}) {
  const allowed = (env.PM_ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const origins = allowed.length ? allowed : DEFAULT_ORIGINS;
  const origin = request.headers.get('origin') ?? '';
  const h = cors(origin, origins);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') return json({ ok: true, service: 'PokeMatch estrategista' }, 200, h);
  if (origin && h['access-control-allow-origin'] !== origin) return json({ error: 'origem não autorizada' }, 403, h);
  if (!env.ANTHROPIC_API_KEY && !deps.client) return json({ error: 'servidor sem ANTHROPIC_API_KEY' }, 503, h);

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const day = new Date().toISOString().slice(0, 10);
  const key = `${ip}|${day}`;
  const limit = +(env.PM_STRATEGIST_LIMIT ?? 20);
  if ((perIp.get(key) ?? 0) >= limit) return json({ error: `Limite de ${limit} leituras do estrategista por dia atingido. Volte amanhã!` }, 429, h);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'pedido inválido' }, 400, h); }
  const facts = String(body?.facts ?? '');
  if (!facts.startsWith('DOR DO JOGADOR:') || !facts.includes('LISTA DO OPONENTE')) return json({ error: 'pedido inválido: mande a ficha do PokeMatch' }, 400, h);
  if (facts.length > MAX_FACTS) return json({ error: 'ficha grande demais' }, 413, h);

  perIp.set(key, (perIp.get(key) ?? 0) + 1);
  try {
    const client = deps.client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const out = await requestStrategy(client, facts, { model: env.PM_STRATEGIST_MODEL || DEFAULT_MODEL });
    return json(out, 200, h);
  } catch (err) {
    const status = err?.status === 429 ? 429 : err?.status === 401 ? 502 : 502;
    return json({ error: `a IA não respondeu: ${String(err?.message ?? err).slice(0, 200)}` }, status, h);
  }
}

// Cloudflare Workers
export default { fetch: (request, env) => handle(request, env) };
