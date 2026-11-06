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

import { DEFAULT_MODEL, STRATEGY_SCHEMA, SYSTEM_PT, requestStrategy } from './strategist-core.js';
export { DEFAULT_MODEL, STRATEGY_SCHEMA, SYSTEM_PT };
const SYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Dragon: 'N', Colorless: 'C' };
const cost = (c) => (c ?? []).map((x) => `{${SYM[x] ?? x[0]}}`).join('');
const short = (s, n = 260) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

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
  // Discordâncias: a citação precisa existir no texto da carta (pega efeito inventado, ex.: "Farigiraf só bloqueia Tera")
  const norm = (x) => String(x ?? '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
  const disagreements = (s.disagreements ?? []).map((d) => {
    if (!d.card || !d.quote) return { ...d, status: '?', check: 'sem carta/citação para conferir' };
    const card = findIn(opp, d.card) ?? findIn(me, d.card) ?? db.byName.get(normName(d.card))?.[0] ?? null;
    if (!card) return { ...d, status: 'erro', check: `a carta ${d.card} não existe entre as legais` };
    const found = norm(card.text).includes(norm(d.quote));
    return { ...d, status: found ? 'ok' : 'erro', check: found ? 'a citação está no texto da carta (o raciocínio ainda é da IA)' : `a citação NÃO está no texto do ${card.name} — o texto real é: "${short(card.text, 200)}"` };
  });
  const ok = claims.filter((c) => c.status === 'ok').length;
  return { claims, techs, disagreements, summary: { claims: claims.length, confirmed: ok, refuted: claims.filter((c) => c.status === 'erro').length, unknown: claims.filter((c) => c.status === '?').length } };
}

// ---------- Execução ----------
// No navegador: monta a ficha com o motor (rápido, sem chave) — depois manda só a ficha ao servidor.
export function prepareStrategy({ myText, oppText, context = '', db }) {
  const r = analyze(myText, oppText, db, { limit: 12, context });
  const me = profileDeck(parseDeck(myText, db));
  const opp = profileDeck(parseDeck(oppText, db));
  return { r, me, opp, facts: buildFacts(r, me, opp, context) };
}
// Tudo num lugar só (servidor Node local, avaliação no GitHub)
export async function runStrategist({ client, myText, oppText, context = '', db, model = DEFAULT_MODEL, maxTokens = 16000 }) {
  const { r, me, opp, facts } = prepareStrategy({ myText, oppText, context, db });
  const { strategy, usage } = await requestStrategy(client, facts, { model, maxTokens });
  const verification = verifyStrategy(strategy, { me, opp, r, db });
  return { strategy, verification, engine: r, usage, model };
}
