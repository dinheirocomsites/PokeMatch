// Motor de sugestões: cruza as fraquezas do deck oponente com as etiquetas de
// counter de cada carta legal e avalia se a carta cabe no deck do jogador.
import { extractTags, matches, selectorPt, typePt, maxDamage, attackDamage, OWNER_PT, copyAttackOf } from './tags.js';
import { profileDeck } from './profile.js';
import { parseDeck } from './parser.js';
import { evaluateFit, deadInMatchup } from './fit.js';
import { damageVs } from './damage.js';
import { buildOptions, findCombos } from './synergy.js';
import { simulateRace, planText, parseDenial } from './prizes.js';
import { readContext, clusterOf, CLUSTERS } from './context.js';
import { consistencyImpact } from './consistency.js';
import { diagnoseDisruption, disruptionValue, counterTags, AXES } from './diagnosis.js';

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
    if (maxDamage(e.card) === 0 || e.feas < 0.3) continue;
    if (matches(sel, e.card, ctx)) { hit += e.threat; covered.push(e.card.name); } else uncovered.push(e.card.name);
  }
  const attackThreat = opp.threat.filter((e) => maxDamage(e.card) > 0 && e.feas >= 0.3).reduce((s, e) => s + e.threat, 0) || 1;
  return { cov: hit / attackThreat, covered, uncovered };
}

function canPayCost(cost, me) {
  return (cost ?? []).every((t) => t === 'Colorless' || me.energyTypes.has(t));
}

// Valor de uma etiqueta contra o deck oponente → { value, why }
function tagValue(t, opp, me, ctx) {
  const c = opp.counts;
  const condFactor = (t.cond ?? []).reduce((f, x) => f * (x === 'coin' ? 0.35 : x.startsWith('prizes') ? 0.6 : x === 'afterKO' ? 0.7 : x === 'ifKO' ? 0.45 : x === 'active' ? 0.85 : 1), 1);
  const nextTurn = t.source === 'attack' ? 0.65 : 1; // efeito de ataque dura 1 turno e exige atacar
  switch (t.kind) {
    case 'WALL_SELF':
    case 'WALL_CHOSEN': {
      const { cov, covered, uncovered } = coverage(t.sel, opp, ctx);
      if (cov < 0.25) return null;
      const base = t.kind === 'WALL_SELF' ? 75 : 40;
      return {
        covered, source: t.source,
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
      const protectsMain = me.mainAttacker && (t.protects === 'team' || (t.protects === 'noRuleBox' && !me.mainAttacker.isRuleBox));
      return {
        covered: protectsMain ? covered : [], source: t.source,
        value: 65 * cov * protectedShare * condFactor * nextTurn * (protectsMain ? 1 : 0.35),
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
    case 'HAND_PKMN_LOCK': {
      // Team Rocket's Arbok: no Ativo, o oponente não joga da mão (banco nem evolução) Pokémon com Habilidade
      const hit = opp.entries.filter((e) => e.card.category === 'Pokemon' && e.card.abilities?.length && (!t.exceptOwner || e.card.owner !== t.exceptOwner));
      const n = hit.reduce((s2, e) => s2 + e.count, 0);
      if (n < 4) return null;
      return { value: 45 * clamp(n / 10) * condFactor, why: `"${t.name}": enquanto estiver no Ativo, o oponente não joga da mão Pokémon com Habilidade — nem no banco, nem evoluindo (${n} cartas dele: ${names(hit.map((e) => e.card.name))}).` };
    }
    case 'SUPPORTER_LOCK':
      return { value: 35 * clamp(c.supporter / 12) * nextTurn * condFactor, why: `"${t.name}": o oponente não pode jogar Supporters no próximo turno (${c.supporter} na lista).` };
    case 'EXTRA_DMG': {
      if (t.onlyFor && !me.names.has(t.onlyFor)) return null;
      const { cov, covered } = coverage(t.sel, opp, ctx);
      if (cov < 0.4) return null;
      let usable = 1;
      // Bônus só para Pokémon de um Treinador (Hop's Snorlax, Postwick, Cynthia's Roserade…)
      if (t.ownerFor) {
        const mine = me.threat.filter((e) => maxDamage(e.card) > 0);
        usable = mine.filter((e) => e.card.owner === t.ownerFor).reduce((s, e) => s + e.threat, 0) / (mine.reduce((s, e) => s + e.threat, 0) || 1);
        if (usable < 0.2) return null;
        const oppToo = t.both && opp.entries.some((e) => e.card.owner === t.ownerFor);
        return { value: (t.amount / 40) * 28 * cov * usable * condFactor * (oppToo ? 0.6 : 1), why: `"${t.name}": +${t.amount} de dano nos ataques dos seus Pokémon de ${OWNER_PT[t.ownerFor] ?? t.ownerFor} — ${pct(usable)} do seu ataque.${oppToo ? ` Atenção: vale também para os Pokémon de ${OWNER_PT[t.ownerFor] ?? t.ownerFor} do oponente.` : ''}` };
      }
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
    case 'COST_CHANGE': {
      // Taxa de energia nos atacantes dele (ex.: Nighttime Mine: ataques de Tera custam {C} a mais)
      if (t.delta < 0) return null;
      const { cov, covered } = coverage(t.sel, opp, ctx);
      if (cov < 0.25) return null;
      const mineHit = t.both ? me.threat.filter((e) => maxDamage(e.card) > 0 && matches(t.sel, e.card)) : [];
      const myShare = mineHit.reduce((s2, e) => s2 + e.threat, 0) / (me.totalThreat || 1);
      // Quanto atrasa: o ataque principal de cada atacante atingido passa de N para N+1 energias
      const hitAtk = opp.threat.filter((e) => covered.includes(e.card.name)).map((e) => { const a = (e.card.attacks ?? []).filter((x) => attackDamage(x) > 0).sort((x, y) => attackDamage(y) - attackDamage(x))[0]; return a && { who: e.card.name, atk: a.name, n: (a.cost ?? []).length }; }).filter(Boolean);
      const avgN = hitAtk.length ? hitAtk.reduce((s2, x) => s2 + x.n, 0) / hitAtk.length : 3;
      const slow = clamp(1 / avgN + 0.25);
      return { value: 50 * cov * slow * clamp(1 - myShare * 1.5, 0.2, 1), why: `"${t.name}": ataques de ${selectorPt(t.sel)} custam +1 energia — ${hitAtk.slice(0, 2).map((x) => `"${x.atk}" do ${x.who} passa de ${x.n} para ${x.n + 1} energias`).join('; ')} (atinge ${pct(cov)} do poder de ataque dele).${mineHit.length ? ` Atenção: também taxa os seus ${names(mineHit.map((e) => e.card.name))}.` : ' Não afeta os seus atacantes.'}` };
    }
    case 'HP_DOWN': {
      const { cov, covered } = coverage(t.sel, opp, ctx);
      if (cov < 0.2) return null;
      return { value: 18 * cov, why: `"${t.name}": ${selectorPt(t.sel)} ficam com −${t.amount} HP (${names(covered)}) — equivale a +${t.amount} de dano seu contra eles.` };
    }
    case 'STATUS': {
      // Sono/paralisia travam o Ativo dele (valem mais); confusão/queimadura/veneno dão dano e chance de erro
      const v = { paralyzed: 14, asleep: 11, confused: 8, burned: 6, poisoned: 5 }[t.status] ?? 5;
      return { value: v * condFactor * (t.source === 'attack' ? 0.8 : 1), why: `"${t.name}": deixa o Ativo do oponente ${{ paralyzed: 'Paralisado', asleep: 'Adormecido', confused: 'Confuso', burned: 'Queimado', poisoned: 'Envenenado' }[t.status]}.` };
    }
    case 'PLACE_COUNTERS': {
      // Contadores no oponente sem atacar: nocauteia Pokémon de pouco HP (ex.: Budew, 30 HP)
      const weak = opp.entries.filter((e) => e.card.category === 'Pokemon' && e.card.hp <= t.amount);
      if (!weak.length || t.source === 'attack') return null;
      const share = weak.reduce((s2, e) => s2 + e.count, 0) / Math.max(1, c.pokemon);
      return { value: 30 * clamp(share * 3) * condFactor, why: `"${t.name}": coloca ${t.amount} de dano sem precisar atacar — nocauteia ${names(weak.map((e) => `${e.card.name} (${e.card.hp} HP)`))}.` };
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

// Plano de troca: o que sai para a tech entrar.
// Prioridade: cartas mortas no matchup → cópias extras de cartas não essenciais.
function suggestCuts(me, opp, slotsNeeded) {
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
    const dead = deadInMatchup(c, me, opp);
    if (dead) { out.push({ name: c.name, count: entry.count, expend: 10 + entry.count, why: `morta neste matchup: ${dead}`, dead: true }); continue; }
    const relevance = tags.filter((t) => t.kind !== 'STADIUM_REPLACE').reduce((s, t) => s + (tagValue(t, opp, me, { lockedByMe: new Map() })?.value ?? 0), 0);
    if (relevance >= 15) continue; // carta já ajuda neste matchup
    const isEngine = /search your deck|draw \d+ cards/i.test(c.text) && entry.count >= 4;
    if (isEngine) continue;
    let expend = 0;
    let why = '';
    if (entry.count >= 3) { expend = entry.count - 2 + 0.5; why = `${entry.count} cópias — dá para ficar com ${entry.count - 1}`; }
    else if (entry.count === 2 && c.category === 'Trainer') { expend = 0.8; why = 'Treinador situacional com 2 cópias'; }
    else if (entry.count === 1 && relevance < 5 && c.category === 'Pokemon' && maxDamage(c) < 100) { expend = 0.6; why = 'tech de 1 cópia com pouco efeito neste matchup'; }
    if (relevance > 0) expend *= 0.6;
    if (expend > 0) out.push({ name: c.name, count: entry.count, expend, why });
  }
  out.sort((a, b) => b.expend - a.expend);
  // Monta o plano: tira 1 de cada (ou mais de uma carta morta) até cobrir os slots
  const plan = [];
  for (const o of out) {
    if (plan.reduce((s, p) => s + p.qty, 0) >= slotsNeeded) break;
    const room = slotsNeeded - plan.reduce((s, p) => s + p.qty, 0);
    const qty = o.dead ? Math.min(o.count, room) : 1;
    plan.push({ ...o, qty });
  }
  return { plan, alternatives: out.filter((o) => !plan.some((p) => p.name === o.name)).slice(0, 3) };
}

export function analyze(myText, oppText, db, { limit = 8, context = '' } = {}) {
  const myParsed = parseDeck(myText, db);
  const oppParsed = parseDeck(oppText, db);
  const me = profileDeck(myParsed);
  const opp = profileDeck(oppParsed);
  // Condições que meu deck consegue causar no oponente (para seletores tipo "Burned Pokémon")
  const myStatuses = new Set();
  for (const e of me.entries) for (const a of e.card.attacks ?? []) {
    const m = (a.effect ?? '').match(/opponent.s active pok[eé]mon is now (burned|poisoned|confused|asleep|paralyzed)/i);
    if (m) myStatuses.add(m[1].toLowerCase());
  }
  const ctx = { lockedByMe: locksFromMyDeck(me, opp), oppSpecialEnergy: opp.counts.specialEnergy > 0, myStatuses };
  // Diagnóstico por eixos de disrupção (trava de Itens, mão, energia, banco, habilidades)
  const disruption = diagnoseDisruption(me, opp);

  // Troca de nocaute: este Pokémon nocauteia atacantes importantes do oponente entregando MENOS prêmios?
  // (Pega casos como Moltres × Ogerpon: 1 energia, 110 contra ex, ×2 na fraqueza = 220.)
  const keyTargets = opp.threat.filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).some((a) => attackDamage(a)));
  const keyThreat = keyTargets.reduce((s, e) => s + e.threat, 0) || 1;
  const mainKillers = new Set();
  if (me.mainAttacker) for (const e of keyTargets) if ((e.card.attacks ?? []).some((a) => damageVs(a, e.card, me.mainAttacker, { deck: opp, oppTaken: 3 }).dmg >= me.mainAttacker.hp - 20)) mainKillers.add(e.card.name);
  const koTradeValue = (card) => {
    if (card.category !== 'Pokemon') return null;
    let best = null;
    for (const a of card.attacks ?? []) {
      const cost = (a.cost ?? []).length;
      if (cost > 3) continue;
      // Precisa ser pagável com as suas energias + no máximo 1 cópia de energia de outro tipo
      const missingTyped = (a.cost ?? []).filter((t) => t !== 'Colorless' && !me.energyTypes.has(t));
      if (missingTyped.length > 1) continue;
      const kos = [];
      let share = 0;
      for (const e of keyTargets) {
        if (e.card.prizeValue <= card.prizeValue) continue; // só troca favorável
        const r = damageVs(a, card, e.card, { deck: me, oppTaken: 3, ...me.pressure });
        if (r.dmg >= e.card.hp) { kos.push({ name: e.card.name, dmg: r.dmg, notes: r.notes }); share += e.threat / keyThreat; }
      }
      if (!kos.length) continue;
      const hitsKillers = kos.filter((k) => mainKillers.has(k.name));
      // Nocautear QUEM MATA o seu atacante é o problema do diagnóstico: pesa mais que o resto
      const killerFrac = mainKillers.size ? hitsKillers.length / mainKillers.size : 0;
      const value = Math.min(45, 30 * killerFrac + 30 * share);
      if (!best || value > best.value) best = { a, cost, kos, hitsKillers, value };
    }
    if (!best || best.value < 8) return null;
    const list = best.kos.map((k) => `${k.name} (${Math.round(k.dmg)}${k.notes.includes('fraqueza') ? ', fraqueza' : ''})`).join(', ');
    return {
      kind: 'KO_TRADE', attackName: best.a.name, koNames: best.kos.map((k) => k.name), value: best.value,
      why: `Com ${best.cost} energia${best.cost > 1 ? 's' : ''}, "${best.a.name}" nocauteia ${list} entregando só ${card.prizeValue} prêmio${card.prizeValue > 1 ? 's' : ''}${best.hitsKillers.length ? ` — inclusive quem mata o seu ${me.mainAttacker.name}` : ''}.`,
    };
  };

  // Fonte de cópia: o seu deck tem um Pokémon que usa ataques do banco (N's Zoroark ex "Night Joker" copia
  // ataques dos seus Pokémon de N pagando só o custo dele). Uma tech do mesmo dono vira ataque novo do copiador,
  // sem precisar de energia própria: só fica no banco.
  const copiers = me.entries.filter((e) => e.card.category === 'Pokemon').map((e) => ({ e, copy: (e.card.attacks ?? []).find((a) => copyAttackOf(a)) })).filter((x) => x.copy);
  const copySourceValue = (card) => {
    if (card.category !== 'Pokemon' || (card.attacks ?? []).some((a) => copyAttackOf(a))) return null;
    let best = null;
    for (const { e: cp, copy } of copiers) {
      const { owner } = copyAttackOf(copy);
      if (owner && card.owner !== owner) continue;
      if (!canPayCost(copy.cost, me)) continue;
      const tgts = opp.threat.filter((t) => t.card.hp);
      const tot = tgts.reduce((s2, t) => s2 + t.threat, 0) || 1;
      for (const a of card.attacks ?? []) {
        if (!attackDamage(a) && !/[×+]$/.test(String(a.damage ?? ''))) continue;
        const virt = { ...a, cost: copy.cost };
        const newKos = [];
        let share = 0, gain = 0;
        for (const t of tgts) {
          const now = Math.max(0, ...(cp.card.attacks ?? []).map((x) => damageVs(x, cp.card, t.card, { deck: me, oppTaken: 3, ...me.pressure }).dmg));
          const r = damageVs(virt, cp.card, t.card, { deck: me, oppTaken: 3, ...me.pressure });
          if (r.dmg >= t.card.hp && now < t.card.hp) { newKos.push({ name: t.card.name, dmg: r.dmg }); share += t.threat / tot; }
          if (t.card.name === opp.mainAttacker?.name) gain = r.dmg - now;
        }
        const v = newKos.length ? Math.min(50, 12 + 45 * share) : gain >= 30 ? Math.min(20, 6 + gain / 10) : 0;
        if (v && (!best || v > best.value)) best = { value: v, a, cp, copy, newKos, gain };
      }
    }
    if (!best || best.value < 8) return null;
    const cost = best.copy.cost.map((x) => `{${{ Darkness: 'D', Fire: 'R', Water: 'W', Grass: 'G', Lightning: 'L', Psychic: 'P', Fighting: 'F', Metal: 'M', Colorless: 'C' }[x] ?? x}}`).join('');
    return {
      kind: 'COPY_SOURCE', value: best.value, attackName: best.a.name, copier: best.cp.card.name, koNames: best.newKos.map((k) => k.name),
      why: `"${best.copy.name}" do seu ${best.cp.card.name} copia "${best.a.name}" (${best.a.damage}) pagando só ${cost}${best.newKos.length ? `: nocauteia ${best.newKos.map((k) => `${k.name} (${Math.round(k.dmg)})`).join(', ')} — hoje o ${best.cp.card.name} não nocauteia` : `: +${Math.round(best.gain)} de dano no ${opp.mainAttacker?.name}`}. O ${card.name} não precisa de energia: só fica no banco.`,
    };
  };

  const evaluate = (card) => {
    const reasons = [];
    const used = [];
    for (const t of extractTags(card)) {
      const v = tagValue(t, opp, me, ctx);
      if (v && v.value >= 3) { reasons.push({ ...v, kind: t.kind }); used.push(t); }
    }
    const w = weaknessValue(card, opp, me);
    if (w) reasons.push(w);
    const kt = koTradeValue(card);
    if (kt) reasons.push(kt);
    const cs = copiers.length ? copySourceValue(card) : null;

    if (cs) reasons.push(cs);
    for (const r of disruptionValue(card, disruption, me)) reasons.push(r);
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
    // Avalia o pacote sem e com energia habilitadora e fica com o melhor
    let best = null;
    const valueAttackName = ev.reasons.find((r) => r.kind === 'KO_TRADE')?.attackName ?? null;
    let options = card.category === 'Pokemon' ? buildOptions(card, me, opp, db, valueAttackName) : [null];
    // Fonte de cópia não precisa pagar o próprio ataque: pacote sem energia nova
    if (ev.reasons[0]?.kind === 'COPY_SOURCE') { const noE = options.filter((o) => !o?.energy); options = noE.length ? noE : options.map((o) => o && { ...o, energy: null }); }
    for (const opt of options) {
      const reasons = [...ev.reasons];
      if (opt?.damage?.kos.length) {
        const d = opt.damage;
        const parts = [`${d.base} ("${d.attack.name}"${d.vs ? ` no ${d.vs}${d.notes?.length ? `: ${d.notes.filter((x) => !/envenenado/.test(x)).join(', ')}` : ''}` : ''})`, d.boost ? `+${d.boost} (combo)` : '', d.passive ? `+${d.passive} (dano passivo)` : ''].filter(Boolean).join(' ');
        reasons.push({ kind: 'COMBO_DMG', koNames: d.kos.map((k) => k.replace(' (fraqueza!)', '')), value: 30 * d.koShare, why: `Dano no SEU deck: ${parts} = ${d.total} → nocauteia em 1 ataque: ${d.kos.join(', ')}.` });
      }
      for (const u of opt?.unlocks ?? []) reasons.push({ kind: 'UNLOCK', value: 6, why: `A energia nova também libera "${u.attack}" do seu ${u.name}.` });
      reasons.sort((a, b) => b.value - a.value);
      const impact = clamp(reasons.reduce((s, r, i) => s + r.value * (i === 0 ? 1 : 0.4), 0), 0, 100);
      const fit = evaluateFit(card, ev.used, reasons, me, opp, db, opt);
      const score = impact * fit.factor;
      if (!best || score > best.score) best = { card, impact: Math.round(impact), fit: Math.round(fit.factor * 100), parts: fit.parts, score: Math.round(score), reasons, notes: fit.notes, slots: fit.slots, pkg: opt };
    }
    candidates.push(best);
  }
  // ---------- Corrida de prêmios: simula e testa techs ----------
  // Resultado da corrida: vencer importa mais; depois, cada prêmio de margem vale bastante
  const outcome = (b) => (b.win ? 100 - b.turns * 5 + (6 - b.oppTaken) * 10 : b.myTaken * 5 - 50);
  const describe = (b) => `${b.win ? 'vitória' : 'derrota'} ${b.win ? `${b.myTaken}×${b.oppTaken}` : `${b.myTaken}×${b.oppTaken}`}`;
  const naive = me.mainAttacker ? simulateRace(me, opp, { only: [me.mainAttacker.name] }) : null;
  const baseRace = simulateRace(me, opp);
  const baseScore = outcome(baseRace.best);
  const naiveScore = naive ? outcome(naive.best) : baseScore;
  // Testa a tech na melhor ordem E no jeito "normal" (só o atacante principal + a tech)
  const raceWith = (opts) => {
    const r = simulateRace(me, opp, opts);
    let delta = outcome(r.best) - baseScore;
    let rn = null;
    // "Só com o atacante principal" vale para redutores de prêmio (Legacy Energy…). Para atacantes novos
    // não: qualquer segundo atacante "vira" esse cenário, e a lista já tem outras saídas (ex.: Pecharunt).
    if (naive && !opts.extraAttackers?.length) {
      rn = simulateRace(me, opp, { ...opts, only: [me.mainAttacker.name] });
      delta = Math.max(delta, (outcome(rn.best) - naiveScore) * 0.6);
    }
    return { r, rn, delta };
  };
  const raceReason = (r, delta, how, rn) => {
    const parts = [];
    if (rn && naive && outcome(rn.best) > naiveScore) parts.push(`jogando só com ${me.mainAttacker.name}: ${describe(naive.best)} → ${describe(rn.best)}`);
    if (outcome(r.best) > baseScore) parts.push(`na melhor ordem: ${describe(baseRace.best)} → ${describe(r.best)}`);
    const flip = (rn && naive && !naive.best.win && rn.best.win) || (!baseRace.best.win && r.best.win);
    return { kind: 'PRIZE_RACE', flip, value: clamp(delta * 0.8, 0, 45), why: `Simulação da corrida de prêmios ${how} — ${parts.join('; ') || 'melhora a margem'}.` };
  };
  // (a) cartas que reduzem prêmios
  for (const card of db.unique) {
    if (me.names.has(card.name) || !/fewer prize/i.test(card.text)) continue;
    const spec = parseDenial(card, me);
    if (!spec || spec.blocked) continue;
    const opts = card.category === 'Pokemon' ? buildOptions(card, me, opp, db) : [null];
    for (const opt of opts.slice(-1)) {
      const { r, rn, delta } = raceWith({ denial: spec, extraAttackers: spec.self ? [{ card, count: 1 }] : [], energyTypes: opt?.energyTypes });
      if (delta <= 0) continue;
      const how = spec.attachTo ? `com ${card.name} no ${spec.attachTo}` : `com ${card.name} em jogo`;
      const reasons = [raceReason(r, delta, how, rn), { kind: 'PRIZE_DENIAL', value: 10, why: `"${card.name}": o oponente pega 1 prêmio a menos${spec.vsEx ? ' quando um Pokémon ex dele nocauteia' : ''}${spec.types ? ` um Pokémon ${spec.types.join('/')} seu` : spec.attachTo ? ` ao nocautear o ${spec.attachTo}` : ''}${spec.uses === 1 ? ' (1 vez por jogo)' : ''}.` }];
      const prev = candidates.find((c) => c?.card.name === card.name);
      const impact = clamp(reasons.reduce((s2, x, i) => s2 + x.value * (i ? 0.4 : 1), 0) + (prev ? prev.impact * 0.4 : 0), 0, 100);
      const fit = evaluateFit(card, [], reasons, me, opp, db, opt);
      const cand = { card, impact: Math.round(impact), fit: Math.round(fit.factor * 100), parts: fit.parts, score: Math.round(impact * fit.factor), reasons: [...reasons, ...(prev?.reasons ?? [])], notes: fit.notes, slots: fit.slots, pkg: opt, race: { plan: planText((rn && outcome(rn.best) - naiveScore > outcome(r.best) - baseScore ? rn : r).best), result: describe(r.best), naiveResult: rn && describe(rn.best) } };
      if (prev) Object.assign(prev, cand); else candidates.push(cand);
    }
  }
  // (b) atacantes novos (principalmente de 1 prêmio) — testa os melhores candidatos com dano
  // Testa no simulador quem nocauteia algo E quem é muralha (a muralha também precisa provar valor na corrida)
  const isWall = (c) => c.reasons.some((x) => ['WALL_SELF', 'WALL_CHOSEN'].includes(x.kind));
  const withDmg = candidates.filter((c) => c?.card.category === 'Pokemon' && c.pkg && (c.pkg.damage?.kos?.length || isWall(c))).sort((a, b) => b.score - a.score).slice(0, 18);
  for (const c of withDmg) {
    if (c.reasons.some((x) => x.kind === 'PRIZE_RACE')) continue; // já simulada como redutora de prêmios
    const { r, rn, delta } = raceWith({ extraAttackers: [{ card: c.card, count: 1 }], energyTypes: c.pkg.energyTypes });
    if (!r?.best) continue;
    const uses = (x) => x?.best.steps.some((st) => st.attacker === c.card.name);
    if (delta > 0 && (uses(r) || uses(rn))) {
      c.reasons.push(raceReason(r, delta, `usando ${c.card.name}`, rn));
      c.reasons.sort((a, b) => b.value - a.value);
      c.impact = Math.round(clamp(c.reasons.reduce((s2, x, i) => s2 + x.value * (i ? 0.4 : 1), 0), 0, 100));
      c.score = Math.round(c.impact * (c.fit / 100));
      c.race = { plan: planText(r.best), result: describe(r.best) };
    }
    // Simulou e quase não mudou a corrida? A tech resolve pouco na prática: perde parte do impacto
    if (delta * 0.8 < 8) {
      c.impact = Math.round(c.impact * 0.82);
      c.score = Math.round(c.impact * (c.fit / 100));
      (c.notes.sinergia ??= []).push(`⚠ Na simulação da corrida de prêmios ela quase não muda o resultado (${describe(baseRace.best)} → ${describe(r.best)}).`);
    }
  }

  // ---------- Diagnóstico: por que este deck perde este matchup? ----------
  const main = me.mainAttacker;
  const killers = [];
  if (main) {
    const hurt = /if this pok[eé]mon has any damage counters/i.test(main.text) ? 20 : 0;
    for (const e of opp.threat) {
      if (e.feas < 0.3) continue;
      const weak = (main.weaknesses ?? []).some((w) => (e.card.types ?? []).includes(w.type));
      const dmg = Math.max(0, ...(e.card.attacks ?? []).map((a) => damageVs(a, e.card, main, { deck: opp, oppTaken: 3 }).dmg));
      if (dmg >= main.hp - hurt) killers.push({ name: e.card.name, dmg: Math.round(dmg), weak, prize: e.card.prizeValue });
    }
  }
  const killerNames = killers.map((k) => k.name);
  const diagnosis = [];
  if (killers.length) diagnosis.push(`${killers.map((k) => k.name).join(' e ')} nocauteiam ${main.name} (${main.hp} HP) em 1 ataque${killers.some((k) => k.weak) ? ` — fraqueza a ${typePt(main.weaknesses[0].type)}` : ''}.`);
  if (killers.length && main.prizeValue > Math.min(...killers.map((k) => k.prize))) diagnosis.push(`Troca desfavorável: você entrega ${main.prizeValue} prêmios por ${main.name} e pega ${Math.min(...killers.map((k) => k.prize))} ao nocautear ${killers.length > 1 ? 'eles' : 'ele'}.`);
  if (naive) diagnosis.push(`Jogando só com ${main.name}: ${describe(naive.best)}.${baseRace.best.win && !naive.best.win ? ` Com a melhor ordem da sua lista dá para virar (${describe(baseRace.best)}) — a tech certa deve deixar isso mais seguro.` : ''}`);
  for (const ax of disruption.axes) if (ax.severity >= 0.3) diagnosis.push(`${AXES[ax.key].label}: ${ax.evidence}`);
  if (!killers.length && !disruption.axes.some((a) => a.severity >= 0.3)) diagnosis.push(`Não encontrei um ponto fraco claro do seu deck neste matchup pelas regras atuais — as sugestões abaixo são ideias, avalie com cuidado.`);
  if (me.board?.benchNeeded >= 5) diagnosis.push(`Seu banco já fica cheio no plano normal (${me.board.pieces.join(', ')} + ${me.board.backup} de reserva): techs que ocupam banco custam caro.`);

  // ---------- Margem de nocaute: matar o atacante principal dele TODO turno ----------
  // Compara o dano do seu atacante principal "sozinho" com o dano "com tudo montado" (combos do deck)
  let koGap = null;
  const oppMain = opp.mainAttacker;
  if (main && oppMain && oppMain.category === 'Pokemon') {
    const selfDamaged = me.entries.some((e) => /place \d+ damage counters on that pok[eé]mon|also does \d+ damage to itself/i.test(e.card.text));
    const atk = (main.attacks ?? []).filter((a) => canPayCost(a.cost, me)).sort((a, b) => attackDamage(b) - attackDamage(a))[0];
    if (atk) {
      // HP efetivo do alvo: reduções de HP que você JÁ joga (ex.: Gravity Mountain em Estágio 2)
      const myHpDown = me.tagsByCard.flatMap(({ entry, tags }) => tags.filter((t) => t.kind === 'HP_DOWN' && matches(t.sel, oppMain)).map((t) => ({ by: entry.card.name, amount: t.amount })));
      const hpCut = Math.max(0, ...myHpDown.map((x) => x.amount));
      const hp = oppMain.hp - hpCut;
      const alone = damageVs(atk, main, oppMain, { deck: me, oppTaken: 2, selfDamaged }).dmg;
      const combo = synergyCombos(main, me);
      const pieces = [];
      if (combo.boost) pieces.push({ name: combo.boostBy, amount: combo.boost });
      if (combo.passive) pieces.push({ name: combo.passiveBy, amount: combo.passive });
      const full = alone + pieces.reduce((s2, p) => s2 + p.amount, 0);
      const need = Math.max(0, hp - alone);
      // Menor conjunto de peças que fecha a conta
      let minSet = null;
      for (let mask = 0; mask < 1 << pieces.length; mask++) {
        const set = pieces.filter((_, i) => mask & (1 << i));
        if (set.reduce((s2, p) => s2 + p.amount, 0) >= need && (!minSet || set.length < minSet.length)) minSet = set;
      }
      koGap = { target: oppMain.name, hp, hpBase: oppMain.hp, hpCut, hpCutBy: myHpDown.map((x) => x.by), attack: atk.name, alone, full, need, pieces, minSet };
      if (need > 0) {
        const sev = full < hp ? 1 : clamp(0.35 + 0.25 * (minSet?.length ?? 2));
        koGap.severity = sev;
        disruption.axes.push({ key: 'ko_gap', severity: sev, evidence: '' });
        // Se outro problema é mais urgente (quem mata o seu atacante em 1 hit), esta linha vem depois dele
        diagnosis.splice(killers.length && !killerNames.includes(oppMain.name) ? Math.min(diagnosis.length, 2) : 0, 0, full < hp
          ? `Margem de nocaute: o ${main.name} faz ${alone} no ${oppMain.name} (${hp} HP${hpCut ? `, já com −${hpCut} do ${koGap.hpCutBy.join('/')}` : ''}) e nem com tudo montado (${full}) nocauteia.`
          : `Margem de nocaute: sozinho o ${main.name} faz ${alone} no ${oppMain.name} (${hp} HP${hpCut ? `, já com −${hpCut} do ${koGap.hpCutBy.join('/')}` : ''}); para nocautear todo turno precisa de +${need} vindo de ${minSet.map((p) => `${p.name} (+${p.amount})`).join(' + ')} montado(s) TODO turno.`);
      }
    }
  }
  // Techs que fecham a margem: dano extra contra o alvo ou HP reduzido do alvo
  if (koGap?.need > 0) {
    for (const c of candidates) {
      if (!c || c.reasons.some((r) => r.kind === 'KO_GAP')) continue;
      const bonus = extractTags(c.card).filter((t) => (t.kind === 'EXTRA_DMG' && matches(t.sel, oppMain) && (!t.onlyFor || t.onlyFor === main.name) && (!t.ownerFor || t.ownerFor === main.owner) && !(t.needsNoRuleBox && main.isRuleBox)) || (t.kind === 'HP_DOWN' && matches(t.sel, oppMain)));
      if (!bonus.length) continue;
      const amt = Math.max(...bonus.map((t) => t.amount));
      const piecesSaved = koGap.minSet ? koGap.minSet.filter((p) => p.amount <= amt).length : 0;
      const closes = koGap.alone + amt >= koGap.hp;
      // "Todo turno": Ferramenta/Estádio/Habilidade ficam em jogo; Supporter gasta o Supporter do turno; Item pode ser travado
      const persistent = ['Tool', 'Stadium'].includes(c.card.trainerType) || c.card.category === 'Pokemon';
      const perTurn = c.card.trainerType === 'Supporter' ? 0.7 : c.card.trainerType === 'Item' ? 0.8 : 1;
      // Se quem mata o seu atacante é outro Pokémon, nocautear este alvo é um problema secundário
      const secondary = killers.length && !killerNames.includes(koGap.target) ? 0.6 : 1;
      const value = (closes ? 40 : 18 + 10 * piecesSaved) * perTurn * secondary;
      c.reasons.unshift({ kind: 'KO_GAP', value, why: `Ajuda a nocautear ${koGap.target} todo turno: +${amt} faz o ${main.name} chegar a ${koGap.alone + amt}${closes ? ` — fecha os ${koGap.hp} HP SEM depender de ${koGap.minSet.map((p) => p.name).join(' + ')}` : ` (precisa de ${koGap.hp})`}.${persistent ? ' Fica em jogo: vale todo turno sem gastar recurso.' : c.card.trainerType === 'Supporter' ? ' Mas é Supporter: para valer todo turno você gasta o Supporter do turno (sem Boss/Lillie\'s nesse turno).' : ' É Item: uma cópia por turno, e trava de Itens bloqueia.'}` });
      c.impact = Math.round(clamp(c.reasons.reduce((s2, x, i) => s2 + x.value * (i ? 0.4 : 1), 0), 0, 100));
      c.score = Math.round(c.impact * (c.fit / 100));
    }
  }

  // HP extra (Ferramenta): faz o seu atacante principal SOBREVIVER a quem hoje o nocauteia em 1 ataque?
  if (main && killers.length) {
    for (const card of db.unique) {
      if (me.names.has(card.name) || card.trainerType !== 'Tool') continue;
      const hb = extractTags(card).find((t) => t.kind === 'HP_BOOST');
      if (!hb) continue;
      // Ferramenta restrita a um Pokémon ("the Cynthia's Pokémon this card is attached to", "the Pikachu ex…")
      const only = card.text.match(/the (.+?) this card is attached to/i)?.[1];
      if (only && !/^pok[eé]mon$/i.test(only)) {
        const who = only.replace(/ pok[eé]mon$/i, '');
        if (!main.name.toLowerCase().startsWith(who.toLowerCase())) continue;
      }
      const hurt = /if this pok[eé]mon has any damage counters/i.test(main.text) ? 20 : 0;
      const survives = killers.filter((k) => k.dmg < main.hp + hb.amount - hurt);
      if (!survives.length) continue;
      const reasons = [{ kind: 'SURVIVE', value: 45 * (survives.length / killers.length), why: `"${card.name}": +${hb.amount} HP no ${main.name} (${main.hp}→${main.hp + hb.amount}) — ele passa a aguentar ${survives.map((k) => `${k.name} (~${k.dmg})`).join(', ')}, que hoje o nocauteiam em 1 ataque.` }];
      const fit = evaluateFit(card, [], reasons, me, opp, db, null);
      const impact = Math.round(reasons[0].value);
      candidates.push({ card, impact, fit: Math.round(fit.factor * 100), parts: fit.parts, score: Math.round(impact * fit.factor), reasons, notes: fit.notes, slots: fit.slots, pkg: null, cluster: 'protecao', survives: survives.map((k) => k.name) });
    }
  }

  // Uma tech só é RELEVANTE se resolve o diagnóstico
  const relevanceOf = (c) => {
    for (const r of c.reasons) {
      if (r.kind === 'SURVIVE') return `faz o ${main.name} sobreviver a ${c.survives.join(' e ')}`;
      if (r.kind === 'KO_GAP') return `ajuda o ${main.name} a nocautear ${koGap.target} todo turno`;
      if (r.kind === 'COST_CHANGE' && ctxRead.weights.disrupcao) return 'dificulta os ataques dele (custo maior)';
      // Pedido "dificultar a vida dele": travas que pegam boa parte do deck dele também resolvem
      if (ctxRead.weights.disrupcao && ['ITEM_LOCK', 'ABILITY_LOCK', 'SUPPORTER_LOCK', 'HAND_PKMN_LOCK'].includes(r.kind) && r.value >= 15) return `dificulta o jogo dele (${{ ITEM_LOCK: 'trava os Itens', ABILITY_LOCK: 'desliga habilidades', SUPPORTER_LOCK: 'trava Supporters', HAND_PKMN_LOCK: 'impede Pokémon com Habilidade vindos da mão' }[r.kind]})`;
      if (r.kind?.startsWith('ANTI_')) {
        const ax = disruption.axes.find((a) => a.key === r.axis);
        if (ax && ax.severity >= 0.3) return `responde a ${AXES[r.axis].label.toLowerCase()}`;
      }
      // Melhorar só a margem não basta para quem pesa no banco/lista; virar derrota em vitória sim
      if (r.kind === 'PRIZE_RACE' && r.value >= 8 && (r.flip || (c.parts?.peso ?? 100) >= 70)) return r.flip ? 'vira a corrida de prêmios (derrota → vitória) na simulação' : 'melhora a corrida de prêmios na simulação';
      if (r.kind === 'PRIZE_DENIAL') return 'reduz os prêmios que você entrega';
      if (r.kind === 'COPY_SOURCE' && r.koNames?.length && (r.koNames.includes(koGap?.target) || r.koNames.some((k) => killerNames.includes(k)) || r.value >= 25)) return `dá ao seu ${r.copier} um ataque que nocauteia ${r.koNames.slice(0, 3).join(', ')}`;
      if (['WALL_SELF', 'WALL_CHOSEN', 'WALL_TEAM'].includes(r.kind) && killerNames.length && killerNames.every((k) => r.covered?.includes(k))) return `bloqueia ${killerNames.join(' e ')}`;
      if (r.kind === 'KO_TRADE' && (c.parts?.peso ?? 100) >= 55 && r.koNames?.some((k) => killerNames.includes(k))) return `nocauteia ${r.koNames.filter((k) => killerNames.includes(k)).join(' e ')} entregando só ${c.card.prizeValue} prêmio${c.card.prizeValue > 1 ? 's' : ''}`;
      // Atacante de 1 prêmio, barato de energizar, que bate na fraqueza de quem mata o seu atacante (ex.: Moltres × Hydrapple)
      if (r.kind === 'WEAKNESS' && main && c.card.prizeValue < main.prizeValue && (c.parts?.peso ?? 100) >= 60) {
        const weakKillers = killers.filter((k) => (opp.entries.find((e) => e.card.name === k.name)?.card.weaknesses ?? []).some((w) => (c.card.types ?? []).includes(w.type)));
        if (weakKillers.length) return `bate na fraqueza de ${weakKillers.map((k) => k.name).join('/')} entregando só ${c.card.prizeValue} prêmio`;
      }
      if (r.kind === 'COMBO_DMG' && main && (c.parts?.peso ?? 100) >= 70 && c.card.prizeValue < main.prizeValue && r.koNames?.some((k) => killerNames.includes(k))) return `nocauteia ${r.koNames.filter((k) => killerNames.includes(k)).join('/')} entregando menos prêmios`;
    }
    return null;
  };

  // ---------- Contexto do jogador ----------
  const ctxRead = readContext(context, me, opp, db);
  for (const c of candidates) {
    if (!c) continue;
    c.cluster = clusterOf(c);
    c.baseScore = c.score;
    let w = ctxRead.weights[c.cluster] ?? 1;
    if (c.card.aceSpec && ctxRead.weights.acespec) w *= 1.3;
    if (ctxRead.mentions.opp.some((n) => c.reasons.some((r) => r.why.includes(n)))) w *= 1.12;
    c.score = Math.round(c.score * w);
    c.boosted = w > 1;
    c.relevance = relevanceOf(c);
    if (!c.relevance && ctxRead.weights[c.cluster] && c.cluster === 'disrupcao') c.relevance = 'você pediu disrupção';
  }

  // Uma entrada por nome (a melhor versão)
  const seenName = new Set();
  for (let i = candidates.length - 1; i >= 0; i--) if (!candidates[i]) candidates.splice(i, 1);
  // Entre versões com o mesmo nome, fica a RELEVANTE de maior nota (ex.: Moltres PFL 1 energia × Moltres 30th 3 energias)
  candidates.sort((a, b) => (b.relevance ? 1 : 0) - (a.relevance ? 1 : 0) || b.score - a.score);
  for (let i = 0; i < candidates.length; i++) { if (seenName.has(candidates[i].card.name)) { candidates.splice(i, 1); i--; } else seenName.add(candidates[i].card.name); }
  candidates.sort((a, b) => b.score - a.score);
  // Uma carta por "família" de motivo principal dominante não é necessário; mantemos variedade simples
  let relevantList = candidates.filter((c) => c.relevance && c.score >= 20);
  // Nunca devolver vazio: se nada resolve com segurança, mostra as melhores ideias marcadas como tal
  if (!relevantList.length) {
    relevantList = candidates.filter((c) => c.relevance && c.score >= 8).slice(0, 5);
    if (relevantList.length < 3) relevantList = [...relevantList, ...candidates.filter((c) => !relevantList.includes(c) && c.score >= 8).slice(0, 5 - relevantList.length).map((c) => Object.assign(c, { relevance: 'ideia — não resolve com segurança o problema principal', lowConfidence: true }))];
  }
  const others = candidates.filter((c) => !relevantList.includes(c)).slice(0, 6).map((c) => ({ name: c.card.name, score: c.score, why: c.reasons[0]?.why ?? '', missing: 'não resolve o problema principal deste matchup' }));
  const top = relevantList.slice(0, limit);
  for (const s of top) {
    const { plan, alternatives } = suggestCuts(me, opp, s.slots);
    const adds = s.pkg ? s.pkg.adds.map((a) => `+${a.qty} ${a.card?.name}${a.card?.setCode && a.role !== 'energia habilitadora' ? ` (${a.card.setCode} ${parseInt(a.card.localId, 10)})` : ''}`) : [`+1 ${s.card.name}`];
    s.swap = { out: plan, in: adds, alternatives };
    // Quanto de consistência a troca custa? (Monte Carlo antes × depois)
    s.consistency = consistencyImpact(me, s);
    s.costs = totalCosts(s, me, opp);
    s.score = Math.round(s.score * s.consistency.factor);
  }
  top.sort((a, b) => b.score - a.score);

  // Counters que o jogador JÁ tem
  const already = [];
  for (const { entry, tags } of me.tagsByCard) {
    const rawCtx = { lockedByMe: new Map() };
    const rs = tags.map((t) => tagValue(t, opp, me, rawCtx)).filter((v) => v && v.value >= 8).sort((a, b) => b.value - a.value);
    if (rs.length && !tags.every((t) => t.kind === 'STADIUM_REPLACE' && rs.length === 1 && rs[0].value < 15)) already.push({ card: entry.card, count: entry.count, reasons: rs });
  }
  if (koGap?.hpCut) for (const by of koGap.hpCutBy) { const e = me.entries.find((x) => x.card.name === by); if (e && !already.some((a) => a.card.name === by)) already.push({ card: e.card, count: e.count, reasons: [{ why: `Tira ${koGap.hpCut} HP do ${koGap.target} (${koGap.hpBase}→${koGap.hp}) — ajuda o ${main.name} a nocautear.` }] }); }
  for (const e of me.entries) {
    const rs = disruptionValue(e.card, disruption, me);
    if (rs.length && !already.some((a) => a.card.name === e.card.name)) already.push({ card: e.card, count: e.count, reasons: rs });
  }
  const locked = [...ctx.lockedByMe].map(([oppCard, by]) => ({ oppCard, by }));

  const clusters = Object.entries(CLUSTERS).map(([key, c]) => {
    const items = top.filter((x) => (key === 'acespec' ? x.card.aceSpec : x.cluster === key) && x.score >= 20).slice(0, 4);
    return { key, ...c, weight: ctxRead.weights[key] ?? 1, items: items.map((x) => ({ name: x.card.name, score: x.score, image: x.card.image, id: x.card.id })) };
  }).filter((c) => c.items.length).sort((a, b) => b.weight - a.weight || b.items[0].score - a.items[0].score);
  const race = {
    naive: naive && { result: describe(naive.best), plan: planText(naive.best), win: naive.best.win, attacker: me.mainAttacker.name },
    best: { result: describe(baseRace.best), plan: planText(baseRace.best), win: baseRace.best.win },
    alt: baseRace.alt && { result: describe(baseRace.alt), plan: planText(baseRace.alt), win: baseRace.alt.win },
    assumptions: `Você ataca primeiro em cada troca; o oponente responde com quem nocauteia seu atacante entregando menos prêmios; ${baseRace.gusts} Boss's Orders disponíveis (cada uso custa); energia: 3 montadas antes do 1º ataque e +${baseRace.income} por turno — atacante novo precisa ser energizado; Boss só alcança Pokémon que ficam no banco (habilidade de banco ou que já atacaram). Os combos (+40 envenenado, +Munkidori) supõem as peças em jogo.`,
  };

  return {
    diagnosis,
    koGap,
    tips: disruption.tips,
    axes: disruption.axes,
    killers,
    others,
    context: ctxRead,
    clusters,
    race,
    me: summarize(me, myParsed),
    opp: summarize(opp, oppParsed),
    insights: insightsFor(opp, me, ctx),
    already,
    locked,
    suggestions: top,
  };
}

// Papel de uma carta no deck (para dizer o que você PERDE ao cortá-la)
function roleOf(card, me) {
  const t = card.text ?? '';
  const roles = [];
  if (/each player shuffles their hand into their deck and draws|shuffles their hand.*opponent|your opponent shuffles their hand/i.test(t)) roles.push('disrupção da mão do oponente');
  if (/draws? \d+ cards/i.test(t) && card.trainerType === 'Supporter') roles.push('compra de cartas');
  if (/switch in 1 of your opponent.s benched/i.test(t)) roles.push('puxar alvo (gust)');
  if (/search your deck for/i.test(t)) roles.push('busca');
  if (/attach/i.test(t) && /energy/i.test(t)) roles.push('energia');
  if (card.trainerType === 'Stadium') roles.push('estádio (também tira o estádio dele)');
  if (card.trainerType === 'Tool' && /more damage/i.test(t)) roles.push('dano extra');
  if (/discard pile into your hand|from your discard pile/i.test(t)) roles.push('recuperação');
  if (card.category === 'Energy') roles.push('energia');
  if (!roles.length) roles.push(card.category === 'Pokemon' ? 'Pokémon de suporte' : 'utilidade');
  return roles;
}

// Custo total da troca: entra, sai (com o papel de cada carta), tempo, banco, prêmios, consistência
function totalCosts(s, me, opp) {
  const costs = [];
  const adds = s.pkg?.adds ?? [{ qty: 1, card: s.card }];
  costs.push({ kind: 'slots', text: `Ocupa ${adds.reduce((n, a) => n + a.qty, 0)} vaga(s) na lista: ${adds.map((a) => `${a.qty}x ${a.card?.name}`).join(' + ')}.` });
  for (const o of s.swap?.out ?? []) {
    const entry = me.entries.find((e) => e.card.name === o.name);
    if (!entry) continue;
    const same = me.entries.filter((e) => e.card.name !== o.name && roleOf(e.card, me).some((r) => roleOf(entry.card, me).includes(r))).reduce((n, e) => n + e.count, 0);
    const roles = roleOf(entry.card, me);
    const left = entry.count - o.qty;
    costs.push({
      kind: 'cut', dead: !!o.dead,
      text: o.dead
        ? `Sai ${o.qty}x ${o.name} (${entry.count}→${left}): morta neste matchup — custo ~zero aqui, mas faz falta nos matchups em que é útil (${roles.join(', ')}).`
        : `Sai ${o.qty}x ${o.name} (${entry.count}→${left}): você perde ${o.qty === 1 && entry.count > 1 ? `1 de ${entry.count} cópias de` : ''} ${roles.join(' / ')}${same ? `; ainda sobra${same > 1 ? 'm' : ''} ${same} outra${same > 1 ? 's' : ''} carta${same > 1 ? 's' : ''} com esse papel` : ' — e não sobra outra carta com esse papel'}.`,
    });
  }
  const tempo = [...(s.notes?.peso ?? [])].find((n) => /Pronto para atacar/.test(n));
  if (tempo) costs.push({ kind: 'tempo', text: tempo.replace(/^[✓⚠✗•]\s*/, '') });
  const bench = [...(s.notes?.peso ?? [])].find((n) => /banco/.test(n));
  if (bench) costs.push({ kind: 'bench', text: bench.replace(/^[✓⚠✗•]\s*/, '') });
  const offType = (s.pkg?.adds ?? []).find((a) => a.role === 'energia habilitadora');
  if (offType) costs.push({ kind: 'energy', text: `Energia de outro tipo (${offType.card?.name}): só ${offType.qty} cópia — precisa achar a tempo; não serve para os seus outros ataques${s.pkg?.unlocks?.length ? ` (exceto ${s.pkg.unlocks.map((u) => u.name).join(', ')})` : ''}.` });
  if (s.card.category === 'Pokemon') costs.push({ kind: 'prize', text: s.card.isMega ? 'Se for nocauteado, entrega 3 prêmios.' : s.card.isEx ? 'Se for nocauteado, entrega 2 prêmios.' : 'Se for nocauteado, entrega só 1 prêmio.' });
  if (s.card.aceSpec && me.aceSpec) costs.push({ kind: 'ace', text: `É ACE SPEC: o seu ${me.aceSpec.name} sai do deck.` });
  const c = s.consistency;
  if (c) {
    const parts = [];
    if (c.setup) parts.push(`setup ${c.setup.before}% → ${c.setup.after}%`);
    parts.push(`Supporter na mão inicial ${c.supporter.before}% → ${c.supporter.after}%`);
    costs.push({ kind: 'consistency', text: `Consistência medida (6.000 partidas): ${parts.join(' · ')} — custo ${c.verdict}.` });
  }
  return costs;
}

// Combos do deck em volta do atacante principal (envenenado + Mochi, dano passivo), com quem fornece cada um
function synergyCombos(main, me) {
  const c = findCombos(main, me, me.energyTypes);
  const boostBy = c.combos.find((x) => /bate \+/.test(x.text))?.with;
  const passiveBy = c.combos.find((x) => /move \d+ de dano/.test(x.text))?.with;
  return { boost: c.boost, boostBy: boostBy ? `${boostBy} (envenenado)` : 'combo', passive: c.passive, passiveBy: passiveBy ?? 'dano passivo' };
}

function summarize(p, parsed) {
  // Arquétipo provável: os dois Pokémon que mais carregam o poder de ataque (como a Limitless nomeia: "Dragapult Dudunsparce")
  const ranked = [...p.threat].filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).length).sort((a, b) => b.threat - a.threat).map((e) => e.card);
  const chosen = [];
  const sameLine = (a, b) => a.evolveFrom === b.name || b.evolveFrom === a.name || a.name.replace(/^Mega | ex$/g, '') === b.name.replace(/^Mega | ex$/g, '');
  for (const c of ranked) { if (chosen.length >= 2) break; if (!chosen.some((x) => sameLine(x, c) || ranked.some((y) => y.evolveFrom === c.name && sameLine(y, x)))) chosen.push(c); }
  const archetype = chosen.map((c) => c.name.replace(/^Mega /, '').replace(/ ex$/, '')).join(' ');
  const topThreats = [...p.threat].sort((a, b) => b.threat - a.threat).slice(0, 5).map((e) => ({ name: e.card.name, count: e.count, share: Math.round((e.threat / p.totalThreat) * 100), image: e.card.image }));
  return {
    total: p.total, errors: parsed.errors, warnings: parsed.warnings, counts: p.counts,
    energyTypes: [...p.energyTypes], mainAttacker: p.mainAttacker?.name ?? null, topThreats, archetype,
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
  for (const e of opp.threat) if (e.feas === 0 && (e.card.attacks ?? []).some((a) => attackDamage(a))) out.push(`${e.card.name} praticamente não ataca: precisa de ${e.feasMissing.map((m) => `${m.need}× ${typePt(m.type)}`).join(' + ')} e a lista tem ${e.feasMissing.map((m) => `${m.have} Energia(s) ${typePt(m.type)}`).join(', ')}.`);
  if (ctx.lockedByMe.size) out.push(`Seu deck já desliga a habilidade de: ${[...ctx.lockedByMe.keys()].join(', ')}.`);
  return out;
}
