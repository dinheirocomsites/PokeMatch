// Camada de IA (rodada 7): manda ao Claude as frases de efeito que as regras ainda não entendem e guarda,
// em data/llm-effects.json, os efeitos que o VALIDADOR do motor aceitou. Roda na sincronização, nunca no site.
//
//   ANTHROPIC_API_KEY=… node scripts/llm-classify.js            classifica só o que ainda não está no cache
//   node scripts/llm-classify.js --dry-run                     mostra quantas frases e o custo estimado
//   node scripts/llm-classify.js --max 100                     limita o número de frases nesta rodada
//
// Sem a chave, não faz nada (sai com código 0) — o site continua funcionando só com as regras.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { auditCoverage } from '../src/coverage.js';
import { KINDS, RESPONSE_SCHEMA, effectKey, ingest } from '../src/llm-effects.js';

const OUT = new URL('../data/llm-effects.json', import.meta.url);
const MODEL = 'claude-opus-5-5';
const BATCH = 25;
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const max = +(args[args.indexOf('--max') + 1] || 0) || Infinity;

const cache = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { model: MODEL, items: {} };
const db = loadDb();
const { unread } = auditCoverage(db);
const todo = unread.map((u) => ({ ...u, key: effectKey(u.card, u.block, u.sentence) })).filter((u) => !cache.items[u.key]).slice(0, max);

// Estimativa: ~4 caracteres por token; saída ~120 tokens por frase (mais o raciocínio)
const inTok = Math.round(todo.reduce((s, u) => s + u.text.length + u.sentence.length + 60, 0) / 4 + Math.ceil(todo.length / BATCH) * 1800);
const outTok = todo.length * 300;
const usd = (inTok * 4 + outTok * 20) / 1e6; // US$ 4 / 20 por milhão de tokens (Claude Opus 5.5)
const cached = unread.filter((u) => cache.items[effectKey(u.card, u.block, u.sentence)]).length;
console.log(`Frases não entendidas pelas regras: ${unread.length} · já classificadas (cache): ${cached} · a classificar agora: ${todo.length}`);
console.log(`Estimativa: ~${inTok.toLocaleString('pt-BR')} tokens de entrada, ~${outTok.toLocaleString('pt-BR')} de saída ≈ US$ ${usd.toFixed(2)}`);
if (dry || !todo.length) process.exit(0);
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('Sem ANTHROPIC_API_KEY: nada a fazer (o site segue só com as regras).');
  process.exit(0);
}

const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic();

const KIND_DOC = Object.entries(KINDS).map(([k, v]) => `- ${k}: ${v.label}`).join('\n');
const SYSTEM = `Você classifica efeitos de cartas do Pokémon TCG (formato Standard) para um motor de análise de matchups.
Para cada frase, responda com os efeitos táticos que ela tem, usando SÓ estes tipos:
${KIND_DOC}
Regras:
- "amount" é sempre em pontos de dano (contadores × 10); para PRIZE_DENIAL, número de prêmios. Use 0 quando não houver número.
- "target": quem é afetado, em inglês do próprio texto (ex.: "Pokémon ex", "Basic Pokémon", "{R} Pokémon"); "" se for qualquer um.
- "status": só para STATUS (asleep, paralyzed, confused, burned, poisoned); nos outros tipos, "none".
- "scope": one/all/active/bench quando fizer sentido; senão "none".
- "conditions": coin (moeda), active (só no Ativo), bench (só no banco), once (1 vez por jogo), afterKO (depois de um nocaute).
- Se a frase não tem efeito que se encaixe, use [{"kind":"NONE",...}] e explique no resumo.
- Nunca invente números que não estão no texto.
- "summary_pt": uma frase curta em português do Brasil dizendo o que o efeito faz no jogo.
Responda direto, sem preâmbulo.`;

async function classify(batch) {
  const cards = new Map(batch.map((u) => [u.card, u.text]));
  const payload = {
    cards: [...cards].map(([name, text]) => ({ name, text })),
    sentences: batch.map((u) => ({ id: u.key, card: u.card, block: u.block, kind: u.kind, sentence: u.sentence })),
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        system: SYSTEM,
        output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } }, // esforço: padrão do modelo (medium)
        messages: [{ role: 'user', content: `Classifique as frases abaixo (o texto completo de cada carta vem junto para contexto).\n\n${JSON.stringify(payload)}` }],
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new Error('recusa');
      if (msg.stop_reason === 'max_tokens') throw new Error('resposta cortada (max_tokens)');
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { data: JSON.parse(text), usage: msg.usage };
    } catch (err) {
      const retry = err instanceof Anthropic.RateLimitError || (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) || err instanceof SyntaxError;
      if (!retry || attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

let ok = 0, rejected = 0, spentIn = 0, spentOut = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const { data, usage } = await classify(batch);
  spentIn += usage?.input_tokens ?? 0; spentOut += usage?.output_tokens ?? 0;
  const r = ingest(cache, batch, data, MODEL);
  ok += r.ok; rejected += r.rejected;
  writeFileSync(OUT, JSON.stringify(cache, null, 1)); // salva a cada lote (não perde o que já foi pago)
  console.log(`lote ${i / BATCH + 1}/${Math.ceil(todo.length / BATCH)}: ${batch.length} frases`);
}
console.log(`Efeitos aceitos pelo validador: ${ok} · rejeitados: ${rejected} · tokens: ${spentIn} entrada / ${spentOut} saída (≈ US$ ${((spentIn * 4 + spentOut * 20) / 1e6).toFixed(2)})`);
