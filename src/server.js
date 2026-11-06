// Servidor HTTP sem dependências: serve a interface e a API de análise.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDb } from './db.js';
import { analyze } from './engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = +(process.env.PORT ?? 3000);
const db = loadDb();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };

import { toJson } from './serialize.js';
import { runStrategist, DEFAULT_MODEL } from './strategist.js';

// Estrategista: só com ANTHROPIC_API_KEY no ambiente do servidor (a chave nunca vai para o navegador).
// Limite simples por IP para ninguém gastar a chave à vontade.
const LIMIT_PER_DAY = +(process.env.PM_STRATEGIST_LIMIT ?? 20);
const usage = new Map();
let anthropic = null;
async function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); anthropic = new Anthropic(); }
  return anthropic;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 100_000) throw new Error('payload grande demais'); }
      const { mine, opp, context } = JSON.parse(body || '{}');
      if (!mine?.trim() || !opp?.trim()) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Cole as duas listas.' })); }
      const result = toJson(analyze(mine, opp, db, { limit: 8, context: String(context ?? '').slice(0, 2000) }), db);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(result));
    }
    if (req.method === 'POST' && url.pathname === '/api/strategist') {
      const c = await client();
      if (!c) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Estrategista desligado: o servidor não tem ANTHROPIC_API_KEY.' })); }
      const ip = req.socket.remoteAddress ?? '?';
      const day = new Date().toISOString().slice(0, 10);
      const k = `${ip}|${day}`;
      if ((usage.get(k) ?? 0) >= LIMIT_PER_DAY) { res.writeHead(429, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: `Limite de ${LIMIT_PER_DAY} análises do estrategista por dia atingido.` })); }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 100_000) throw new Error('payload grande demais'); }
      const { mine, opp, context } = JSON.parse(body || '{}');
      if (!mine?.trim() || !opp?.trim()) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Cole as duas listas.' })); }
      usage.set(k, (usage.get(k) ?? 0) + 1);
      const out = await runStrategist({ client: c, myText: mine, oppText: opp, context: String(context ?? '').slice(0, 2000), db, model: process.env.PM_STRATEGIST_MODEL ?? DEFAULT_MODEL });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ strategy: out.strategy, verification: out.verification, usage: out.usage, model: out.model }));
    }
    if (url.pathname.startsWith('/img/')) {
      const f = normalize(url.pathname.replace('/img/', '')).replace(/^(\.\.[/\\])+/, '');
      const data = await readFile(join(ROOT, 'data', 'img', f));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' });
      return res.end(data);
    }
    if (url.pathname.startsWith('/examples/')) {
      const f = normalize(url.pathname.replace('/examples/', '')).replace(/^(\.\.[/\\])+/, '');
      const txt = await readFile(join(ROOT, 'test', 'decks', f), 'utf8');
      res.writeHead(200, { 'content-type': TYPES['.txt'] });
      return res.end(txt);
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = join(PUBLIC, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    const notFound = err.code === 'ENOENT';
    res.writeHead(notFound ? 404 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: notFound ? 'não encontrado' : String(err.message ?? err) }));
  }
});

server.listen(PORT, () => console.log(`PokeMatch rodando em http://localhost:${PORT}  (base: ${db.unique.length} cartas, marcas ${db.marks.join(', ')})`));
