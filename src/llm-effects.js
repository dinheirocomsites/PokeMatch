// Camada de IA (rodada 7): efeitos de carta lidos pelo Claude na sincronização, CONFERIDOS pelo motor.
// O Claude só pode responder com os tipos de efeito que o motor sabe usar; cada resposta passa por um
// validador que confere o tipo, os números e se o texto da carta realmente fala daquilo.
// O que não passa fica registrado como rejeitado (com o motivo) e não entra no cálculo.

// Tipos aceitos → o que o validador exige no texto da frase
export const KINDS = {
  EXTRA_DMG: { re: /more damage/i, amount: 'damage', label: 'dano extra' },
  REDUCE: { re: /less damage/i, amount: 'damage', label: 'redução de dano' },
  WALL_SELF: { re: /prevent all (damage|effects)/i, label: 'proteção total' },
  HEAL: { re: /heal/i, amount: 'damage', label: 'cura' },
  PLACE_COUNTERS: { re: /damage counters?/i, amount: 'damage', label: 'contadores no oponente' },
  STATUS: { re: /asleep|paralyzed|confused|burned|poisoned|special condition/i, label: 'condição especial' },
  ENERGY_DISRUPT: { re: /energy/i, label: 'tira energia do oponente' },
  HAND_DISRUPT: { re: /hand/i, label: 'mexe na mão do oponente' },
  SWITCH: { re: /switch|retreat/i, label: 'troca / recuo' },
  TRAP: { re: /retreat/i, label: 'prende o Ativo dele' },
  DRAWBACK: { re: /this pok[eé]mon|your next turn|itself/i, label: 'desvantagem do próprio ataque' },
  PRIZE_DENIAL: { re: /prize/i, amount: 'prize', label: 'muda prêmios' },
  ITEM_LOCK: { re: /item/i, label: 'trava Itens' },
  ABILITY_LOCK: { re: /abilit/i, label: 'trava habilidades' },
  SUPPORTER_LOCK: { re: /supporter/i, label: 'trava Supporters' },
  RETALIATE: { re: /attacking pok[eé]mon/i, amount: 'damage', label: 'retaliação' },
  SURVIVE_FULL: { re: /knocked out/i, label: 'aguenta um nocaute' },
  FORCE_SWITCH: { re: /switch|bench/i, label: 'tira o Ativo dele' },
  EVOLVE_LOCK: { re: /evolv/i, label: 'trava evolução' },
  DEVOLVE: { re: /devolve|evolution card/i, label: 'desfaz evolução' },
  ATTACH_LOCK: { re: /attach/i, label: 'trava ligar energia' },
  BOUNCE_OPP: { re: /deck|hand/i, label: 'tira Pokémon dele de jogo' },
  NONE: { re: /./, label: 'sem efeito tático na análise' },
};
const STATUSES = ['asleep', 'paralyzed', 'confused', 'burned', 'poisoned'];
const CONDS = ['coin', 'active', 'bench', 'once', 'afterKO'];

// Esquema da resposta (saída estruturada da API)
export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'effects', 'summary_pt'],
        properties: {
          id: { type: 'string' },
          summary_pt: { type: 'string' },
          effects: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'amount', 'target', 'status', 'scope', 'conditions'],
              // sem null: a API não aceita enum com null misturado a tipo-lista → "vazio" é 0 / "" / "none"
              properties: {
                kind: { type: 'string', enum: Object.keys(KINDS) },
                amount: { type: 'integer' },
                target: { type: 'string' },
                status: { type: 'string', enum: [...STATUSES, 'none'] },
                scope: { type: 'string', enum: ['one', 'all', 'active', 'bench', 'none'] },
                conditions: { type: 'array', items: { type: 'string', enum: CONDS } },
              },
            },
          },
        },
      },
    },
  },
};

// Confere um efeito contra a frase. Devolve { ok, effect } ou { ok: false, why }.
export function validateEffect(sentence, e0) {
  // "vazio" do esquema (0, "", "none") vira ausente
  const e = e0 && { ...e0, amount: e0.amount || null, target: e0.target || null, status: e0.status === 'none' ? null : e0.status, scope: e0.scope === 'none' ? null : e0.scope };
  const spec = KINDS[e?.kind];
  if (!spec) return { ok: false, why: `tipo desconhecido: ${e?.kind}` };
  const s = sentence ?? '';
  if (!spec.re.test(s)) return { ok: false, why: `o texto não fala de ${spec.label}` };
  const out = { kind: e.kind, cond: [...new Set((e.conditions ?? []).filter((c) => CONDS.includes(c)))] };
  // Moeda no texto → o efeito é com moeda, diga o que disser a resposta (conservador)
  if (/flip a coin|if heads/i.test(s) && !out.cond.includes('coin')) out.cond.push('coin');
  // Condição escrita ("If you have 6 or more…", "As long as…", "only if…") → o efeito nem sempre vale
  else if (/^(if|as long as)\b|\bonly if\b|, if (you|your|this)/i.test(s.trim()) && !out.cond.length) out.cond.push('if');
  if (spec.amount) {
    const n = e.amount;
    if (!Number.isInteger(n) || n <= 0) return { ok: false, why: 'faltou o número' };
    const nums = [...s.matchAll(/\d+/g)].map((m) => +m[0]);
    if (spec.amount === 'damage') {
      if (n > 400 || n % 10) return { ok: false, why: `número fora do jogo: ${n}` };
      // o número tem que estar no texto (como dano ou como contadores ×10)
      if (!nums.some((x) => x === n || x * 10 === n) && !/all damage/i.test(s)) return { ok: false, why: `o número ${n} não aparece na carta` };
    }
    if (spec.amount === 'prize' && !(n >= 1 && n <= 2)) return { ok: false, why: `prêmios fora do jogo: ${n}` };
    out.amount = n;
  }
  if (e.kind === 'STATUS') {
    if (!STATUSES.includes(e.status) || !new RegExp(e.status, 'i').test(s)) return { ok: false, why: 'condição especial não bate com o texto' };
    out.status = e.status;
  }
  if (e.target) out.target = String(e.target).slice(0, 80);
  if (e.scope) out.scope = e.scope;
  return { ok: true, effect: out };
}

// Chave estável de uma frase (carta + bloco + texto)
export function effectKey(cardName, blockName, sentence) {
  const str = `${cardName}|${blockName}|${sentence}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Índice por carta: { [cardName]: [{ block, sentence, effects, summary }] }
export function indexByCard(llm) {
  const out = {};
  for (const it of Object.values(llm?.items ?? {})) {
    if (!it.effects?.length && !it.summary_pt) continue;
    (out[it.card] ??= []).push({ block: it.block, sentence: it.sentence, effects: it.effects ?? [], summary: it.summary_pt });
  }
  return out;
}

// Aplica uma resposta do Claude ao cache: cada efeito passa pelo validador; o rejeitado fica registrado com o motivo.
// batch: [{ key, card, block, sentence }] · data: { items: [{ id, effects, summary_pt }] }
export function ingest(cache, batch, data, model, today = new Date().toISOString().slice(0, 10)) {
  const byId = new Map(batch.map((u) => [u.key, u]));
  let ok = 0, rejected = 0;
  for (const item of data?.items ?? []) {
    const u = byId.get(item.id);
    if (!u) continue; // id que não pedimos: ignora
    const effects = [], refused = [];
    for (const e of item.effects ?? []) {
      const v = validateEffect(u.sentence, e);
      if (v.ok) effects.push(v.effect); else refused.push({ kind: e?.kind, why: v.why });
    }
    ok += effects.length; rejected += refused.length;
    cache.items[u.key] = { card: u.card, block: u.block, sentence: u.sentence, effects, rejected: refused, summary_pt: String(item.summary_pt ?? '').slice(0, 240), model, at: today };
  }
  return { ok, rejected };
}
