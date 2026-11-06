// Estrategista (passo 3): a IA lê o matchup e escreve o plano do oponente em afirmações VERIFICÁVEIS;
// o motor confere cada uma com as próprias contas (dano, HP, energia pagável, carta existe/é legal).
// Este módulo não chama a API sozinho: recebe um `client` (SDK da Anthropic) — serve para Node, Deno (Lovable/Supabase) etc.
import { analyze } from './engine.js';
import { parseDeck } from './parser.js';
import { profileDeck } from './profile.js';
import { damageVs } from './damage.js';
import { spreadOf } from './prizes.js';
import { requirements } from './diagnosis.js';
import { normName } from './db-core.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const SYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Dragon: 'N', Colorless: 'C' };
const cost = (c) => (c ?? []).map((x) => `{${SYM[x] ?? x[0]}}`).join('');
const short = (s, n = 260) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

// Esquema da resposta (sem null: "vazio" é "" ou 0)
export const STRATEGY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['opponent_plan', 'my_problem', 'claims', 'tech_ideas', 'play_tips_pt', 'disagreements_pt', 'uncertainty_pt'],
  properties: {
    opponent_plan: {
      type: 'object', additionalProperties: false, required: ['summary_pt', 'damage_sources', 'enablers', 'key_turns_pt'],
      properties: {
        summary_pt: { type: 'string' },
        damage_sources: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['attacker', 'attack', 'copied_from', 'targets', 'why_pt'],
            properties: { attacker: { type: 'string' }, attack: { type: 'string' }, copied_from: { type: 'string' }, targets: { type: 'string', enum: ['active', 'bench', 'several'] }, why_pt: { type: 'string' } },
          },
        },
        enablers: { type: 'array', items: { type: 'string' } },
        key_turns_pt: { type: 'string' },
      },
    },
    my_problem: { type: 'object', additionalProperties: false, required: ['summary_pt', 'mechanism_pt'], properties: { summary_pt: { type: 'string' }, mechanism_pt: { type: 'string' } } },
    claims: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'kind', 'attacker', 'attack', 'target', 'text_pt'],
        properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['ko', 'can_attack', 'in_deck'] }, attacker: { type: 'string' }, attack: { type: 'string' }, target: { type: 'string' }, text_pt: { type: 'string' } },
      },
    },
    tech_ideas: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['card', 'why_pt', 'answers'], properties: { card: { type: 'string' }, why_pt: { type: 'string' }, answers: { type: 'array', items: { type: 'string' } } } },
    },
    play_tips_pt: { type: 'array', items: { type: 'string' } },
    disagreements_pt: { type: 'array', items: { type: 'string' } },
    uncertainty_pt: { type: 'string' },
  },
};

export const SYSTEM_PT = `Você é um jogador experiente de Pokémon TCG (Standard) ajudando a preparar um matchup.
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
6. Se você discordar da análise do motor, diga em "disagreements_pt" (com o porquê).
Regras: use só nomes de cartas que existem; nunca invente números; escreva em português do Brasil; seja direto, sem preâmbulo.`;

// ---------- Ficha de fatos (o que a IA lê) ----------
function cardFacts(e) {
  const c = e.card;
  if (c.category !== 'Pokemon') return `${e.count}x ${c.name}${c.trainerType ? ` [${c.trainerType}]` : c.category === 'Energy' ? ' [Energia]' : ''}: ${short(c.effect ?? c.text, 220)}`;
  const at = (c.attacks ?? []).map((a) => `${a.name} ${cost(a.cost)} ${a.damage ?? ''}${a.copiedFrom ? ` (COPIADO de ${a.copiedFrom})` : ''}: ${short(a.effect, 180)}`).join(' | ');
  const ab = (c.abilities ?? []).map((a) => `Habilidade ${a.name}: ${short(a.effect, 200)}`).join(' | ');
  return `${e.count}x ${c.name} (${c.stage ?? 'Basic'}${c.evolveFrom ? ` de ${c.evolveFrom}` : ''}, ${c.hp} HP, ${(c.types ?? []).join('/')}, fraqueza ${(c.weaknesses ?? []).map((w) => w.type).join('/') || '—'}, vale ${c.prizeValue} prêmio${c.prizeValue > 1 ? 's' : ''})${ab ? ` — ${ab}` : ''} — Ataques: ${at || '—'}`;
}
export function buildFacts(r, me, opp, context) {
  const deck = (p) => p.entries.map(cardFacts).join('\n');
  const plan = (x) => (x?.plan ?? []).slice(0, 4).map((t) => `  T${t.turn}: ${t.mine} / ${t.theirs}`).join('\n');
  return [
    `DOR DO JOGADOR: ${context || '(não informada)'}`,
    `\nLISTA DO JOGADOR (atacante principal segundo o motor: ${me.mainAttacker?.name ?? '?'}):\n${deck(me)}`,
    `\nLISTA DO OPONENTE (arquétipo provável: ${r.opp?.archetype ?? '?'}):\n${deck(opp)}`,
    `\nDIAGNÓSTICO DO MOTOR:\n${(r.diagnosis ?? []).map((d) => `- ${d}`).join('\n')}`,
    r.tips?.length ? `\nDICAS DO MOTOR:\n${r.tips.map((d) => `- ${d}`).join('\n')}` : '',
    `\nSIMULAÇÃO DO MOTOR (corrida de prêmios, modelo simplificado):\n- Só com o atacante principal: ${r.race?.naive?.result ?? '?'}\n${plan(r.race?.naive)}\n- Melhor linha: ${r.race?.best?.result ?? '?'}`,
    `\nSUGESTÕES DO MOTOR: ${(r.suggestions ?? []).slice(0, 8).map((s) => `${s.card.name} (${s.score}; ${s.relevance ?? ''})`).join(' · ')}`,
  ].join('\n');
}

// ---------- Conferência pelo motor ----------
const findIn = (p, name) => p.entries.find((e) => normName(e.card.name) === normName(name ?? ''))?.card ?? null;
function findAttack(p, attackerName, attackName) {
  const card = findIn(p, attackerName);
  if (!card) return { card: null };
  const n = normName(attackName ?? '');
  const a = (card.attacks ?? []).find((x) => normName(x.copiedAttack ?? '') === n) ?? (card.attacks ?? []).find((x) => normName(x.name) === n);
  return { card, attack: a ?? null };
}
const payable = (a, p) => (a.cost ?? []).every((t) => t === 'Colorless' || p.energyTypes.has(t) || (p.anyEnergy ?? 0) > 0);

export function verifyStrategy(s, { me, opp, r, db }) {
  const claims = (s.claims ?? []).map((c) => {
    if (c.kind === 'in_deck') {
      const card = findIn(opp, c.attacker) ?? findIn(me, c.attacker);
      return { ...c, status: card ? 'ok' : 'erro', check: card ? 'a carta está na lista' : 'essa carta não está em nenhuma das listas' };
    }
    const { card, attack } = findAttack(opp, c.attacker, c.attack);
    if (!card) return { ...c, status: 'erro', check: `o ${c.attacker} não está na lista do oponente` };
    if (!attack) return { ...c, status: '?', check: `não achei o ataque "${c.attack}" no ${card.name} (nem copiado)` };
    const canPay = payable(attack, opp);
    if (c.kind === 'can_attack') return { ...c, status: canPay ? 'ok' : 'erro', check: canPay ? `paga ${cost(attack.cost)} com as energias do deck${attack.copiedFrom ? ` (copiado do ${attack.copiedFrom})` : ''}` : `precisa de ${cost(attack.cost)} e o deck não tem essa energia` };
    // ko
    const target = findIn(me, c.target);
    if (!target) return { ...c, status: '?', check: `o alvo ${c.target} não está na sua lista` };
    const sp = spreadOf(attack);
    const dmgActive = damageVs(attack, card, target, { deck: opp, oppTaken: 3 }).dmg;
    const dmg = Math.max(dmgActive, sp ? sp.amount : 0); // no banco não tem fraqueza
    const ko = dmg >= target.hp;
    return { ...c, status: !canPay ? 'erro' : ko ? 'ok' : 'erro', damage: Math.round(dmg), hp: target.hp, check: !canPay ? `não paga ${cost(attack.cost)}` : `${Math.round(dmg)} de dano${sp ? ` (${sp.withActive ? 'em vários Pokémon' : 'no banco'})` : ''} contra ${target.hp} HP → ${ko ? 'nocauteia' : 'NÃO nocauteia'}` };
  });
  const techs = (s.tech_ideas ?? []).map((t) => {
    const card = db.byName.get(normName(t.card))?.[0] ?? null;
    if (!card) return { ...t, status: 'erro', check: 'carta não encontrada entre as legais no Standard (marca H em diante)' };
    if (me.names.has(card.name)) return { ...t, status: '?', check: 'você já joga essa carta', name: card.name };
    const req = requirements(card, me, opp);
    if (!req.ok) return { ...t, status: 'erro', check: `não funciona no seu deck: ${req.note}`, name: card.name };
    const eng = (r.suggestions ?? []).find((x) => x.card.name === card.name);
    return { ...t, status: 'ok', name: card.name, image: card.image ?? null, check: eng ? `o motor também sugere (nota ${eng.score}; ${eng.relevance ?? ''})` : `legal e funciona no seu deck${req.note ? ` (${req.note})` : ''}; o motor não tinha essa entre as primeiras`, engineScore: eng?.score ?? null };
  });
  const ok = claims.filter((c) => c.status === 'ok').length;
  return { claims, techs, summary: { claims: claims.length, confirmed: ok, refuted: claims.filter((c) => c.status === 'erro').length, unknown: claims.filter((c) => c.status === '?').length } };
}

// ---------- Execução completa ----------
export async function runStrategist({ client, myText, oppText, context = '', db, model = DEFAULT_MODEL, maxTokens = 16000 }) {
  const r = analyze(myText, oppText, db, { limit: 12, context });
  const me = profileDeck(parseDeck(myText, db));
  const opp = profileDeck(parseDeck(oppText, db));
  const facts = buildFacts(r, me, opp, context);
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PT,
    output_config: { format: { type: 'json_schema', schema: STRATEGY_SCHEMA } },
    messages: [{ role: 'user', content: `FICHA DE FATOS DO MATCHUP\n\n${facts}` }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('a IA recusou responder');
  if (msg.stop_reason === 'max_tokens') throw new Error('resposta da IA cortada (max_tokens)');
  const strategy = JSON.parse(msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const verification = verifyStrategy(strategy, { me, opp, r, db });
  const u = msg.usage ?? {};
  return { strategy, verification, engine: r, usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, usd: ((u.input_tokens ?? 0) * 4 + (u.output_tokens ?? 0) * 20) / 1e6 }, model };
}
