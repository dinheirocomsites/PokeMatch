// Motor de sugestões: cruza as fraquezas do deck oponente com as etiquetas de
// counter de cada carta legal e avalia se a carta cabe no deck do jogador.
import { extractTags, matches, selectorPt, typePt, maxDamage, attackDamage } from './tags.js';
import { profileDeck } from './profile.js';
import { parseDeck } from './parser.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const names = (arr, n = 4) => {
  const list = [...new Set(arr)];
  return list.length > n ? `${list.slice(0, n).join(', ')} +${list.length - n}` : list.join(', ');
};

// Quais Pokémon do oponente já têm a habilidade desligada por cartas do jogador
function locksFromMyDeck(me, opp) {
  const locked = new Map(); // nome -> carta minha que trava
  for (const { entry, tags } of me.tagsByCard) {
    for (const t of tags) {
      if (t.kind !== 'ABILITY_LOCK' || t.scope === 'oppActive') continue;
      for (const e of opp.threat) if (e.card.abilities?.length && matches(t.sel, e.card)) locked.set(e.card.name, entry.card.name);
    }
  }
  return locked;
}

// Fração do poder de ataque do oponente coberta por um seletor
function coverage(sel, opp, ctx) {
  let hit = 0;
  const covered = [];
  const uncovered = [];
  for (const e of opp.threat) {
    if (maxDamage(e.card) === 0) continue;
    if (matches(sel, e.card, ctx)) { hit += e.threat; covered.push(e.card.name); } else uncovered.push(e.card.name);
  }
  const attackThreat = opp.threat.filter((e) => maxDamage(e.card) > 0).reduce((s, e) => s + e.threat, 0) || 1;
  return { cov: hit / attackThreat, covered, uncovered };
}

function canPayCost(cost, me) {
  return (cost ?? []).every((t) => t === 'Colorless' || me.energyTypes.has(t));
}

// Valor de uma etiqueta contra o deck oponente → { value, why }
function tagValue(t, opp, me, ctx) {
  const c = opp.counts;
  const condFactor = (t.cond ?? []).reduce((f, x) => f * (x === 'coin' ? 0.35 : x.startsWith('prizes') ? 0.6 : x === 'afterKO' ? 0.7 : x === 'active' ? 0.85 : 1), 1);
  const nextTurn = t.source === 'attack' ? 0.65 : 1; // efeito de ataque dura 1 turno e exige atacar
  switch (t.kind) {
    case 'WALL_SELF':
    case 'WALL_CHOSEN': {
      const { cov, covered, uncovered } = coverage(t.sel, opp, ctx);
      if (cov < 0.25) return null;
      const base = t.kind === 'WALL_SELF' ? 75 : 40;
      return {
        value: base * cov * condFactor * nextTurn,
        why: `${t.source === 'ability' ? `Habilidade "${t.name}"` : t.source === 'attack' ? `Ataque "${t.name}"` : `"${t.name}"`}: ${t.source === 'attack' ? 'no turno seguinte, ' : ''}previne todo dano de ataques de ${selectorPt(t.sel)}. Cobre ${pct(cov)} do poder de ataque do oponente (${names(covered)}).${uncovered.length ? ` Não cobre: ${names(uncovered, 3)}.` : ''}`,
      };
    }
    case 'BENCH_WALL': {
      // Só protege no banco: vale contra ataques que acertam o banco (snipe/spread)
      const snipers = opp.threat.filter((e) => (e.card.attacks ?? []).some((a) => /benched pok[eé]mon/i.test(a.effect ?? '') && /damage/i.test(a.effect ?? '') && !/for each/i.test(a.effect ?? '')));
      const share = snipers.reduce((s, e) => s + e.threat, 0) / (opp.totalThreat || 1);
      if (share < 0.1) return null;
      return { value: 30 * share, why: `"${t.name}": protegido enquanto estiver no banco — útil contra dano no banco de ${names(snipers.map((e) => e.card.name))}.` };
    }
    case 'WALL_TEAM': {
      const { cov, covered } = coverage(t.sel, opp, ctx);
      if (cov < 0.25) return null;
      // Quanto do MEU poder de ataque está protegido?
      const mine = me.threat.filter((e) => maxDamage(e.card) > 0);
      const myTotal = mine.reduce((s, e) => s + e.threat, 0) || 1;
      const protectedShare = t.protects === 'noRuleBox' ? mine.filter((e) => !e.card.isRuleBox).reduce((s, e) => s + e.threat, 0) / myTotal : t.protects === 'future' ? 0.1 : 1;
      if (protectedShare < 0.15) return null;
      return {
        value: 65 * cov * protectedShare * condFactor * nextTurn,
        why: `"${t.name}": previne dano de ${selectorPt(t.sel)} (${names(covered)}) nos seus Pokémon ${t.protects === 'noRuleBox' ? 'sem Rule Box' : ''} — protege ${pct(protectedShare)} do seu poder de ataque.`,
      };
    }
    case 'REDUCE': {
      const { cov } = coverage(t.sel, opp, ctx);
      if (cov < 0.4 || t.amount < 30) return null;
      return { value: (t.amount / 100) * 35 * cov * condFactor, why: `"${t.name}": recebe ${t.amount} a menos de dano de ${selectorPt(t.sel)} (${pct(cov)} do ataque do oponente).` };
    }
    case 'ABILITY_LOCK': {
      const targets = opp.threat.filter((e) => e.card.abilities?.length && matches(t.sel, e.card));
      const fresh = targets.filter((e) => !ctx.lockedByMe.has(e.card.name));
      const n = fresh.reduce((s, e) => s + e.count, 0);
      if (!n) return null;
      const share = n / Math.max(1, c.withAbility);
      const engine = clamp(c.withAbility / 8);
      const hurtsMe = t.scope === 'all' ? me.tagsByCard.filter(({ entry }) => entry.card.abilities?.length && matches(t.sel, entry.card)).reduce((s, x) => s + x.entry.count, 0) : 0;
      const selfPenalty = clamp(1 - hurtsMe / Math.max(1, me.counts.withAbility + 2), 0.3, 1);
      return {
        value: 55 * share * engine * condFactor * selfPenalty,
        why: `"${t.name}": desliga habilidades de ${selectorPt(t.sel)} — atinge ${n} cartas do oponente (${names(fresh.map((e) => e.card.name))}).${hurtsMe ? ` Atenção: também desliga ${hurtsMe} carta(s) suas.` : ''}`,
      };
    }
    case 'ITEM_LOCK': {
      if (c.item < 8) return null;
      return { value: 50 * clamp(c.item / 20) * condFactor * nextTurn, why: `"${t.name}": o oponente não pode jogar Itens${t.alsoTools ? ' nem Ferramentas' : ''} (ele usa ${c.item} Itens${t.alsoTools ? ` e ${c.tool} Ferramentas` : ''}).` };
    }
    case 'SUPPORTER_LOCK':
      return { value: 35 * clamp(c.supporter / 12) * nextTurn * condFactor, why: `"${t.name}": o oponente não pode jogar Supporters no próximo turno (${c.supporter} na lista).` };
    case 'EXTRA_DMG': {
      if (t.onlyFor && !me.names.has(t.onlyFor)) return null;
      const { cov, covered } = coverage(t.sel, opp, ctx);
      if (cov < 0.4) return null;
      let usable = 1;
      if (t.needsNoRuleBox) {
        const mine = me.threat.filter((e) => maxDamage(e.card) > 0);
        usable = mine.filter((e) => !e.card.isRuleBox).reduce((s, e) => s + e.threat, 0) / (mine.reduce((s, e) => s + e.threat, 0) || 1);
      }
      if (usable < 0.2) return null;
      return { value: (t.amount / 40) * 28 * cov * usable * condFactor, why: `"${t.name}": +${t.amount} de dano contra ${selectorPt(t.sel)} — ${pct(cov)} dos atacantes do oponente são alvo (${names(covered)}).${t.needsNoRuleBox ? ` Só funciona em atacantes sem Rule Box (${pct(usable)} do seu ataque).` : ''}` };
    }
    case 'BENCH_PUNISH':
      return { value: (opp.bigBench ? 40 : 18) * condFactor, why: `"${t.name}": dano aumenta para cada Pokémon no banco${opp.bigBench ? ' — o oponente joga com banco de até 8 (Area Zero Underdepths)' : ''}.` };
    case 'TOOL_HATE':
      if (c.tool < 2) return null;
      return { value: 25 * clamp(c.tool / 5) * condFactor, why: `"${t.name}": descarta Ferramentas (o oponente usa ${c.tool}).` };
    case 'SPECIAL_ENERGY_HATE':
      if (c.specialEnergy < 3) return null;
      return { value: 45 * clamp(c.specialEnergy / 8) * condFactor, why: `"${t.name}": pune Energia Especial (o oponente usa ${c.specialEnergy}).` };
    case 'STADIUM_HATE':
    case 'STADIUM_REPLACE': {
      if (c.stadium < 2) return null;
      const key = opp.stadiums.map((e) => `${e.count}x ${e.card.name}`).join(', ');
      const mine = me.counts.stadium;
      const v = (t.kind === 'STADIUM_HATE' ? 30 : 15) * clamp(c.stadium / 4) * (opp.bigBench ? 1.4 : 1) / (1 + mine / 3);
      return { value: v, why: `${t.kind === 'STADIUM_HATE' ? `"${t.name}": descarta o Estádio em jogo` : 'Estádio: substitui o do oponente'} — ele depende de ${key}${opp.bigBench ? ' (sem ele, o banco volta para 5)' : ''}.${mine && t.kind === 'STADIUM_HATE' ? ` (Você já joga ${mine} Estádio(s), que também fazem isso.)` : ''}` };
    }
    case 'ENERGY_DISRUPT': {
      const avgCost = opp.threat.reduce((s, e) => s + e.count * Math.max(0, ...(e.card.attacks ?? []).map((a) => (a.cost ?? []).length)), 0) / Math.max(1, c.pokemon);
      return { value: 14 * clamp(avgCost / 3) * condFactor * nextTurn, why: `"${t.name}": remove energia do oponente (custo médio de ataque: ${avgCost.toFixed(1)}).` };
    }
    case 'HAND_DISRUPT':
      return { value: 8 * condFactor, why: `"${t.name}": bagunça a mão do oponente.` };
    default:
      return null;
  }
}

// Pokémon atacante que bate na fraqueza do oponente
function weaknessValue(card, opp, me) {
  if (card.category !== 'Pokemon') return null;
  const type = card.types?.[0];
  const share = opp.weakness[type] ?? 0;
  if (share < 0.3) return null;
  const best = (card.attacks ?? []).filter((a) => attackDamage(a) >= 60 && canPayCost(a.cost, me)).sort((a, b) => attackDamage(b) - attackDamage(a))[0];
  if (!best) return null;
  return { value: 35 * share * clamp(attackDamage(best) / 150), why: `Tipo ${typePt(type)}: ${pct(share)} do poder de ataque do oponente é fraco a ${typePt(type)} (dano ×2 com "${best.name}").`, kind: 'WEAKNESS' };
}

// Encaixe no deck do jogador → { factor, notes[], slots }
function fitOf(card, tagsUsed, me, db) {
  let factor = 1;
  const notes = [];
  let slots = 1;
  if (card.category === 'Pokemon') {
    const usableAttack = (card.attacks ?? []).some((a) => attackDamage(a) > 0 && canPayCost(a.cost, me));
    const needsAttack = tagsUsed.some((t) => t.source === 'attack');
    if (needsAttack && !tagsUsed.filter((t) => t.source === 'attack').every((t) => canPayCost(t.cost, me))) {
      factor *= 0.25;
      notes.push(`✗ O ataque precisa de energia que seu deck não tem (${[...new Set(tagsUsed.flatMap((t) => t.cost ?? []).filter((x) => x !== 'Colorless'))].map(typePt).join('/')}).`);
    } else if (!usableAttack) {
      factor *= 0.8;
      const need = [...new Set((card.attacks ?? []).flatMap((a) => a.cost ?? []).filter((x) => x !== 'Colorless'))].map(typePt);
      notes.push(`⚠ Não consegue atacar com as suas energias${need.length ? ` (precisa de ${need.join('/')})` : ''} — funciona como muralha/suporte.`);
    } else notes.push('✓ Consegue atacar com as energias do seu deck.');

    if (card.stage === 'Stage1' || card.stage === 'Stage2') {
      const prevo = db.byName.get(card.evolveFrom?.toLowerCase?.() ?? '')?.[0];
      if (!prevo) { factor *= 0.1; notes.push(`✗ A pré-evolução (${card.evolveFrom}) não está legal no Standard.`); }
      slots = card.stage === 'Stage1' ? 2 : 3;
      if (card.stage === 'Stage2' && me.search.rareCandy) slots = 2;
      factor *= card.stage === 'Stage1' ? 0.88 : me.search.rareCandy ? 0.75 : 0.55;
      if (prevo) notes.push(`• Linha ${slots}-slot: ${card.stage === 'Stage2' ? `${prevo.name} → … → ${card.name}` : `${prevo.name} → ${card.name}`}.`);
      if (me.names.has(card.evolveFrom)) { slots -= 1; factor /= 0.92; notes.push(`✓ Você já joga ${card.evolveFrom}.`); }
    }
    // Acesso por busca
    const basicHp = card.stage === 'Basic' ? card.hp : db.byName.get(card.evolveFrom?.toLowerCase?.() ?? '')?.[0]?.hp;
    const ways = [];
    if (me.search.any) ways.push('Ultra Ball');
    if (me.search.nonRuleBox && !card.isRuleBox) ways.push('Poké Pad');
    if (me.search.basicLowHp && basicHp <= 70) ways.push('Buddy-Buddy Poffin (base)');
    if (me.search.basic || me.search.evolution) ways.push('busca de Básicos/Evolução');
    if (ways.length) notes.push(`✓ Buscável com: ${ways.join(', ')}.`);
    else { factor *= 0.85; notes.push('⚠ Seu deck tem pouca busca para essa carta.'); }

    if (card.isMega) { factor *= 0.8; notes.push('⚠ Mega ex: entrega 3 prêmios se for nocauteado.'); }
    else if (card.isEx) { factor *= 0.9; notes.push('⚠ Pokémon ex: entrega 2 prêmios.'); }
    else notes.push('✓ Sem Rule Box: entrega só 1 prêmio.');
  } else if (card.category === 'Trainer') {
    if (card.trainerType === 'Supporter') { factor *= 0.85; notes.push('• Supporter: gasta o Supporter do turno.'); }
    if (card.trainerType === 'Stadium') {
      const mine = me.stadiums.reduce((s, e) => s + e.count, 0);
      if (mine) notes.push(`• Você já joga ${mine} Estádio(s): ${me.stadiums.map((e) => e.card.name).join(', ')} — talvez trocar 1 por este.`);
      slots = 1;
    }
    if (me.search.trainer) notes.push('✓ Buscável com Team Rocket\'s Petrel.');
  } else if (card.category === 'Energy') {
    if (card.isSpecialEnergy) notes.push('• Energia Especial.');
  }
  if (card.aceSpec && me.aceSpec) { factor *= 0.6; notes.push(`⚠ ACE SPEC: precisa trocar pelo seu ${me.aceSpec.name}.`); }
  return { factor: clamp(factor), notes, slots };
}

// Sugestões de corte (heurística — o jogador conhece o deck melhor)
function suggestCuts(me, opp, ctx, slotsNeeded) {
  const main = me.mainAttacker;
  const core = new Set([main?.name, main?.evolveFrom].filter(Boolean));
  for (const { entry } of me.tagsByCard) {
    const c = entry.card;
    if (/switch in 1 of your opponent.s benched/i.test(c.text) && entry.count >= 2) core.add(c.name); // gust (Boss)
    if (c.category === 'Pokemon' && c.abilities?.length && entry.count >= 3) core.add(c.name); // motor de habilidade
  }
  const out = [];
  for (const { entry, tags } of me.tagsByCard) {
    const c = entry.card;
    if (core.has(c.name) || c.category === 'Energy') continue;
    const relevance = tags.reduce((s, t) => s + (tagValue(t, opp, me, { lockedByMe: new Map() })?.value ?? 0), 0);
    if (relevance >= 15 && !tags.every((t) => t.kind === 'STADIUM_REPLACE')) continue; // carta já ajuda neste matchup
    const isEngine = /search your deck|draw \d+ cards/i.test(c.text) && entry.count >= 4;
    if (isEngine) continue;
    let expend = 0;
    let why = '';
    if (entry.count >= 3) { expend = entry.count - 2 + 0.5; why = `${entry.count} cópias — dá para tirar 1`; }
    else if (entry.count === 2 && c.category === 'Trainer') { expend = 0.8; why = '2 cópias de Treinador situacional'; }
    else if (entry.count === 1 && relevance < 5 && c.category === 'Pokemon' && maxDamage(c) < 100) { expend = 0.6; why = 'tech de 1 cópia com pouco efeito neste matchup'; }
    if (relevance > 0) expend *= 0.6;
    if (expend > 0) out.push({ name: c.name, count: entry.count, expend, why });
  }
  return out.sort((a, b) => b.expend - a.expend).slice(0, Math.max(3, slotsNeeded + 1));
}

export function analyze(myText, oppText, db, { limit = 8 } = {}) {
  const myParsed = parseDeck(myText, db);
  const oppParsed = parseDeck(oppText, db);
  const me = profileDeck(myParsed);
  const opp = profileDeck(oppParsed);
  const ctx = { lockedByMe: locksFromMyDeck(me, opp) };

  const evaluate = (card) => {
    const reasons = [];
    const used = [];
    for (const t of extractTags(card)) {
      const v = tagValue(t, opp, me, ctx);
      if (v && v.value >= 3) { reasons.push({ ...v, kind: t.kind }); used.push(t); }
    }
    const w = weaknessValue(card, opp, me);
    if (w) reasons.push(w);
    if (!reasons.length) return null;
    reasons.sort((a, b) => b.value - a.value);
    // retornos decrescentes para várias razões
    const impact = clamp(reasons.reduce((s, r, i) => s + r.value * (i === 0 ? 1 : 0.4), 0), 0, 100);
    return { reasons, used, impact };
  };

  const candidates = [];
  for (const card of db.unique) {
    if (card.isBasicEnergy || me.names.has(card.name)) continue;
    const ev = evaluate(card);
    if (!ev || ev.impact < 8) continue;
    const fit = fitOf(card, ev.used, me, db);
    const score = ev.impact * fit.factor;
    candidates.push({ card, impact: Math.round(ev.impact), fit: Math.round(fit.factor * 100), score: Math.round(score), reasons: ev.reasons, fitNotes: fit.notes, slots: fit.slots });
  }
  candidates.sort((a, b) => b.score - a.score);
  // Uma carta por "família" de motivo principal dominante não é necessário; mantemos variedade simples
  const top = candidates.slice(0, limit);
  for (const s of top) s.cuts = suggestCuts(me, opp, ctx, s.slots).slice(0, s.slots + 1);

  // Counters que o jogador JÁ tem
  const already = [];
  for (const { entry, tags } of me.tagsByCard) {
    const rawCtx = { lockedByMe: new Map() };
    const rs = tags.map((t) => tagValue(t, opp, me, rawCtx)).filter((v) => v && v.value >= 8).sort((a, b) => b.value - a.value);
    if (rs.length && !tags.every((t) => t.kind === 'STADIUM_REPLACE' && rs.length === 1 && rs[0].value < 15)) already.push({ card: entry.card, count: entry.count, reasons: rs });
  }
  const locked = [...ctx.lockedByMe].map(([oppCard, by]) => ({ oppCard, by }));

  return {
    me: summarize(me, myParsed),
    opp: summarize(opp, oppParsed),
    insights: insightsFor(opp, me, ctx),
    already,
    locked,
    suggestions: top,
  };
}

function summarize(p, parsed) {
  const topThreats = [...p.threat].sort((a, b) => b.threat - a.threat).slice(0, 5).map((e) => ({ name: e.card.name, count: e.count, share: Math.round((e.threat / p.totalThreat) * 100), image: e.card.image }));
  return {
    total: p.total, errors: parsed.errors, warnings: parsed.warnings, counts: p.counts,
    energyTypes: [...p.energyTypes], mainAttacker: p.mainAttacker?.name ?? null, topThreats,
    weakness: Object.entries(p.weakness).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ type: t, typePt: typePt(t), share: Math.round(v * 100) })),
    bigBench: p.bigBench, aceSpec: p.aceSpec?.name ?? null,
  };
}

function insightsFor(opp, me, ctx) {
  const c = opp.counts;
  const out = [];
  if (c.pokemon && c.basic / c.pokemon >= 0.85) out.push(`${Math.round((c.basic / c.pokemon) * 100)}% dos Pokémon do oponente são Básicos.`);
  if (c.pokemon && c.ex / c.pokemon >= 0.5) out.push(`${c.ex} de ${c.pokemon} Pokémon são ex (incluindo ${c.mega} Mega) — cartas que punem/bloqueiam ex brilham aqui.`);
  if (c.withAbility >= 6) out.push(`${c.withAbility} Pokémon com Habilidade — deck depende de habilidades.`);
  if (opp.bigBench) out.push('Usa Area Zero Underdepths para banco de até 8 — remover o Estádio derruba o banco para 5.');
  if (c.item >= 15) out.push(`${c.item} Itens — vulnerável a trava de Itens.`);
  if (c.specialEnergy >= 4) out.push(`${c.specialEnergy} Energias Especiais.`);
  const w = Object.entries(opp.weakness).sort((a, b) => b[1] - a[1])[0];
  if (w && w[1] >= 0.3) out.push(`${Math.round(w[1] * 100)}% do poder de ataque é fraco a ${typePt(w[0])}.`);
  if (ctx.lockedByMe.size) out.push(`Seu deck já desliga a habilidade de: ${[...ctx.lockedByMe.keys()].join(', ')}.`);
  return out;
}
