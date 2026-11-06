// PokeMatch — servidor do estrategista (Lovable Cloud / Supabase Edge Function).
// NÃO EDITE À MÃO: gerado por scripts/build-lovable.js a partir de deploy/strategist-proxy.js e src/strategist-core.js.
// Segredo necessário: ANTHROPIC_API_KEY. Opcionais: PM_STRATEGIST_LIMIT (padrão 20 por IP por dia), PM_ALLOWED_ORIGINS.
// deploy/strategist-proxy.js
import Anthropic from "npm:@anthropic-ai/sdk@^1";

// src/strategist-core.js
var DEFAULT_MODEL = "claude-opus-5-5";
var MAX_FACTS = 6e4;
var STRATEGY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["opponent_plan", "my_problem", "claims", "tech_ideas", "play_tips_pt", "disagreements", "uncertainty_pt"],
  properties: {
    opponent_plan: {
      type: "object",
      additionalProperties: false,
      required: ["summary_pt", "damage_sources", "enablers", "key_turns_pt"],
      properties: {
        summary_pt: { type: "string" },
        damage_sources: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["attacker", "attack", "copied_from", "targets", "why_pt"],
            properties: { attacker: { type: "string" }, attack: { type: "string" }, copied_from: { type: "string" }, targets: { type: "string", enum: ["active", "bench", "several"] }, why_pt: { type: "string" } }
          }
        },
        enablers: { type: "array", items: { type: "string" } },
        key_turns_pt: { type: "string" }
      }
    },
    my_problem: { type: "object", additionalProperties: false, required: ["summary_pt", "mechanism_pt"], properties: { summary_pt: { type: "string" }, mechanism_pt: { type: "string" } } },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "attacker", "attack", "target", "text_pt"],
        properties: { id: { type: "string" }, kind: { type: "string", enum: ["ko", "can_attack", "in_deck"] }, attacker: { type: "string" }, attack: { type: "string" }, target: { type: "string" }, text_pt: { type: "string" } }
      }
    },
    tech_ideas: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["card", "why_pt", "answers"], properties: { card: { type: "string" }, why_pt: { type: "string" }, answers: { type: "array", items: { type: "string" } } } }
    },
    play_tips_pt: { type: "array", items: { type: "string" } },
    // Discordância com o motor: precisa citar o trecho EXATO do texto da carta em que se apoia (o motor confere a citação)
    disagreements: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["text_pt", "card", "quote"], properties: { text_pt: { type: "string" }, card: { type: "string" }, quote: { type: "string" } } }
    },
    uncertainty_pt: { type: "string" }
  }
};
var SYSTEM_PT = `Você é um jogador experiente de Pokémon TCG (Standard) ajudando a preparar um matchup.
Você recebe uma FICHA DE FATOS montada por um motor de regras (listas, textos das cartas, contas e simulação do motor) e a DOR do jogador.
Sua tarefa:
1. Entender o PLANO REAL do oponente: quem causa o dano, com qual ataque, como paga a energia (inclusive ataques copiados de outras cartas, do deck, do banco), quais cartas habilitam o plano e em que turno ele chega.
2. Explicar o problema do jogador (a dor) pelo mecanismo do jogo.
3. Fazer AFIRMAÇÕES VERIFICÁVEIS em "claims" (o motor vai conferir cada uma):
   - kind "ko": attacker = nome exato do Pokémon do oponente que ataca; attack = nome exato do ataque usado (se for copiado, o nome do ataque original); target = nome exato do Pokémon do jogador que cai.
   - kind "can_attack": o attacker consegue usar o attack neste deck.
   - kind "in_deck": a carta (attacker) está na lista do oponente.
4. Sugerir techs em "tech_ideas": cartas legais no Standard atual, com o nome exato em inglês; em "answers", os ids das claims que a tech responde. Prefira poucas e certeiras.
5. Dicas de jogo em "play_tips_pt" (o que fazer na partida, não só no deck).
6. Se você discordar da análise do motor, registre em "disagreements": o porquê (text_pt), a carta em que se apoia (card, nome exato) e o trecho EXATO do texto dessa carta, em inglês, copiado da ficha (quote). Sem citação exata, não discorde: o motor vai conferir a citação.
Regras: use só nomes de cartas que existem; nunca invente números nem efeitos — o texto das cartas está na ficha, confira antes de afirmar; escreva em português do Brasil; seja direto, sem preâmbulo.`;
async function requestStrategy(client, facts, { model = DEFAULT_MODEL, maxTokens = 16e3 } = {}) {
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PT,
    output_config: { format: { type: "json_schema", schema: STRATEGY_SCHEMA } },
    messages: [{ role: "user", content: `FICHA DE FATOS DO MATCHUP

${facts}` }]
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("a IA recusou responder");
  if (msg.stop_reason === "max_tokens") throw new Error("resposta da IA cortada (max_tokens)");
  const strategy = JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  const u = msg.usage ?? {};
  return { strategy, usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, usd: ((u.input_tokens ?? 0) * 4 + (u.output_tokens ?? 0) * 20) / 1e6 }, model };
}

// deploy/strategist-proxy.js
var DEFAULT_ORIGINS = ["https://dinheirocomsites.github.io", "http://localhost:3000"];
var perIp = /* @__PURE__ */ new Map();
function cors(origin, allowed) {
  const ok = allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.(claudeusercontent\.com|lovable\.app|lovableproject\.com)$/.test(origin ?? "");
  return { "access-control-allow-origin": ok ? origin : allowed[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
}
var json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
async function handle(request, env = {}, deps = {}) {
  const allowed = (env.PM_ALLOWED_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const origins = allowed.length ? allowed : DEFAULT_ORIGINS;
  const origin = request.headers.get("origin") ?? "";
  const h = cors(origin, origins);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (request.method !== "POST") return json({ ok: true, service: "PokeMatch estrategista" }, 200, h);
  if (origin && h["access-control-allow-origin"] !== origin) return json({ error: "origem não autorizada" }, 403, h);
  if (!env.ANTHROPIC_API_KEY && !deps.client) return json({ error: "servidor sem ANTHROPIC_API_KEY" }, 503, h);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const key = `${ip}|${day}`;
  const limit = +(env.PM_STRATEGIST_LIMIT ?? 20);
  if ((perIp.get(key) ?? 0) >= limit) return json({ error: `Limite de ${limit} leituras do estrategista por dia atingido. Volte amanhã!` }, 429, h);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "pedido inválido" }, 400, h);
  }
  const facts = String(body?.facts ?? "");
  if (!facts.startsWith("DOR DO JOGADOR:") || !facts.includes("LISTA DO OPONENTE")) return json({ error: "pedido inválido: mande a ficha do PokeMatch" }, 400, h);
  if (facts.length > MAX_FACTS) return json({ error: "ficha grande demais" }, 413, h);
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

// deploy/lovable/entry.js
Deno.serve((req) => handle(req, {
  ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY"),
  PM_ALLOWED_ORIGINS: Deno.env.get("PM_ALLOWED_ORIGINS") ?? "",
  PM_STRATEGIST_LIMIT: Deno.env.get("PM_STRATEGIST_LIMIT") ?? "20",
  PM_STRATEGIST_MODEL: Deno.env.get("PM_STRATEGIST_MODEL") ?? ""
}));
