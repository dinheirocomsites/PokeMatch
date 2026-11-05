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

const slimCard = (c) => c && ({
  id: c.id, name: c.name, image: c.image ? `${c.image}/high.webp` : null, setCode: c.setCode, localId: c.localId,
  category: c.category, stage: c.stage, trainerType: c.trainerType, hp: c.hp, types: c.types, isEx: c.isEx, isMega: c.isMega,
});

function toJson(r) {
  return {
    me: r.me, opp: r.opp, insights: r.insights, locked: r.locked, context: r.context, clusters: r.clusters, race: r.race,
    already: r.already.map((a) => ({ card: slimCard(a.card), count: a.count, reasons: a.reasons.map((x) => x.why) })),
    suggestions: r.suggestions.map((s) => ({
      card: slimCard(s.card), score: s.score, impact: s.impact, fit: s.fit, parts: s.parts, slots: s.slots,
      reasons: s.reasons.map((x) => ({ kind: x.kind, why: x.why })), notes: s.notes,
      pkg: s.pkg && {
        adds: s.pkg.adds.map((a) => ({ qty: a.qty, role: a.role, card: slimCard(a.card) })),
        combos: s.pkg.combos.map((c) => c.text), unlocks: s.pkg.unlocks,
        damage: s.pkg.damage && { attack: s.pkg.damage.attack.name, base: s.pkg.damage.base, boost: s.pkg.damage.boost, passive: s.pkg.damage.passive, total: s.pkg.damage.total, kos: s.pkg.damage.kos },
      },
      swap: s.swap, cluster: s.cluster, boosted: s.boosted, race: s.race,
    })),
    db: { syncedAt: db.syncedAt, marks: db.marks },
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 100_000) throw new Error('payload grande demais'); }
      const { mine, opp, context } = JSON.parse(body || '{}');
      if (!mine?.trim() || !opp?.trim()) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Cole as duas listas.' })); }
      const result = toJson(analyze(mine, opp, db, { limit: 8, context: String(context ?? '').slice(0, 2000) }));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(result));
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

server.listen(PORT, () => console.log(`Tech Finder rodando em http://localhost:${PORT}  (base: ${db.unique.length} cartas, marcas ${db.marks.join(', ')})`));
