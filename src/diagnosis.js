// Diagnóstico por EIXOS: em vez de procurar um único tipo de problema ("quem mata meu atacante"),
// mede cada coisa que o plano do oponente faz contra o SEU deck e quanto isso machuca.
// Cada eixo traz evidências e os tipos de carta que respondem a ele.
import { extractTags, matches, parseSelector, TERA, ANCIENT, isFuture } from './tags.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const list = (arr, n = 4) => [...new Set(arr)].slice(0, n).join(', ');

export const AXES = {
  item_lock: { label: 'Trava de Itens', counters: ['DRAW_ABILITY', 'SUPPORTER_SEARCH'] },
  hand_disrupt: { label: 'Disrupção da sua mão', counters: ['DRAW_ABILITY'] },
  energy_removal: { label: 'Remoção de energia', counters: ['ENERGY_ACCEL', 'ENERGY_RECOVERY', 'ENERGY_MOVE'] },
  spread: { label: 'Dano no seu banco', counters: ['BENCH_WALL', 'BENCH_SHIELD', 'HEAL'] },
  trap: { label: 'Prender o seu Pokémon no Ativo', counters: ['SWITCH'] },
  ko_gap: { label: 'Margem de nocaute', counters: [] }, // tratado no motor (dano extra / HP reduzido do alvo)
  ability_lock: { label: 'Trava das suas habilidades', counters: ['DRAW_ABILITY', 'SUPPORTER_SEARCH'] },
};

export function diagnoseDisruption(me, opp) {
  const axes = [];
  const tips = [];
  const oppTags = opp.tagsByCard.flatMap(({ entry, tags }) => tags.map((t) => ({ ...t, card: entry.card, count: entry.count })));

  // 1) Trava de Itens
  const itemLock = oppTags.filter((t) => t.kind === 'ITEM_LOCK');
  if (itemLock.length && me.counts.item >= 6) {
    const copies = itemLock.reduce((s, t) => s + t.count, 0);
    const early = itemLock.some((t) => t.card.stage === 'Basic' && (t.cost ?? []).length <= 1);
    const myItems = me.entries.filter((e) => e.card.trainerType === 'Item');
    const sev = clamp((me.counts.item / 15) * (copies >= 2 ? 1 : 0.7) * (early ? 1 : 0.8));
    axes.push({ key: 'item_lock', severity: sev, evidence: `${list(itemLock.map((t) => `${t.card.name} (${t.count}x)`))} trava os seus Itens${early ? ' desde o 1º turno (Básico, ataque barato)' : ''}; você joga ${me.counts.item} Itens (${list(myItems.map((e) => e.card.name))}).` });
    if (early) tips.push(`Contra a trava de Itens: no turno em que puder, use as buscas (${list(myItems.filter((e) => /search your deck/i.test(e.card.text)).map((e) => e.card.name), 3)}) ANTES de passar o turno, e priorize Supporters que buscam.`);
  }

  // 2) Disrupção da mão
  const handD = oppTags.filter((t) => t.kind === 'HAND_DISRUPT' || (t.kind === undefined && false));
  const shuffleCards = opp.entries.filter((e) => /each player shuffles their hand|your opponent shuffles their hand|opponent draws (\d+) cards/i.test(e.card.text));
  if (shuffleCards.length) {
    const copies = shuffleCards.reduce((s, e) => s + e.count, 0);
    const afterKO = shuffleCards.filter((e) => /only if any of your pok[eé]mon were knocked out during your opponent.s last turn/i.test(e.card.text));
    const sev = clamp(copies / 4);
    axes.push({ key: 'hand_disrupt', severity: sev, evidence: `${list(shuffleCards.map((e) => `${e.card.name} (${e.count}x)`))} resetam a sua mão${afterKO.length ? `; ${list(afterKO.map((e) => e.card.name))} só pode ser usado depois que VOCÊ nocauteia um Pokémon dele` : ''}.` });
    if (afterKO.length) tips.push(`Cada nocaute que você faz libera ${list(afterKO.map((e) => e.card.name))} para ele (você fica com poucas cartas). Antes de nocautear um Pokémon barato (ex.: o Budew), tenha como se recuperar: compra por habilidade, ou não gaste recursos à toa.`);
  }
  void handD;

  // 3) Remoção de energia
  const eRemove = opp.entries.filter((e) => /discard an energy from (1 of )?your opponent|discard an energy from your opponent.s active/i.test(e.card.text));
  if (eRemove.length) {
    const copies = eRemove.reduce((s, e) => s + e.count, 0);
    const coin = eRemove.every((e) => /flip a coin/i.test(e.card.text));
    const expected = copies * (coin ? 0.5 : 1);
    const need = Math.max(2, ...(me.mainAttacker?.attacks ?? []).map((a) => (a.cost ?? []).length));
    const sev = clamp(expected / (need + 1) / (me.search && me.entries.some((e) => (e.card.abilities ?? []).some((a) => /attach/i.test(a.effect ?? '') && /energy/i.test(a.effect ?? ''))) ? 1.6 : 1));
    axes.push({ key: 'energy_removal', severity: sev, evidence: `${list(eRemove.map((e) => `${e.card.name} (${e.count}x)`))} tira${copies > 1 ? 'm' : ''} energia${coin ? ' (cara ou coroa)' : ''}: ~${expected.toFixed(1)} energia(s) por jogo; o seu ${me.mainAttacker?.name ?? 'atacante'} precisa de ${need}.` });
    tips.push(`Contra a remoção de energia: não concentre energia num Pokémon que não vai atacar já; mantenha aceleração (ex.: ${list(me.entries.filter((e) => (e.card.abilities ?? []).some((a) => /attach/i.test(a.effect ?? ''))).map((e) => e.card.name)) || 'reposição'}) pronta para repor.`);
  }

  // 4) Dano espalhado no seu banco
  const spreadAtk = [];
  for (const e of opp.threat) for (const a of e.card.attacks ?? []) {
    const m = (a.effect ?? '').match(/put (\d+) damage counters on your opponent.s benched/i) || (a.effect ?? '').match(/(\d+) damage to (?:1|2) of your opponent.s benched/i);
    if (m) spreadAtk.push({ by: e.card.name, amount: /counters/i.test(m[0]) ? +m[1] * 10 : +m[1], kind: /counters/i.test(m[0]) ? 'counters' : 'damage' });
  }
  if (spreadAtk.length) {
    const max = Math.max(...spreadAtk.map((s) => s.amount));
    const bench = me.entries.filter((e) => e.card.category === 'Pokemon' && (me.board?.pieces ?? []).concat(me.board?.backup ?? []).includes(e.card.name));
    const fragile = bench.filter((e) => e.card.hp <= max);
    const fragile2 = bench.filter((e) => e.card.hp > max && e.card.hp <= max * 2); // caem em 2 ataques espalhados
    const share = opp.threat.filter((e) => spreadAtk.some((x) => x.by === e.card.name)).reduce((s2, e) => s2 + e.threat, 0) / (opp.totalThreat || 1);
    const sev = clamp(((fragile.length + fragile2.length * 0.5) / Math.max(2, bench.length) + (max >= 60 ? 0.2 : 0)) * clamp(share * 3));
    const kinds = [...new Set(spreadAtk.map((x) => x.kind))];
    if (sev > 0.15) axes.push({ key: 'spread', severity: sev, kinds, evidence: `${list(spreadAtk.map((s) => s.by))} espalha até ${max} de dano no seu banco (${kinds.map((k) => (k === 'counters' ? 'colocando contadores' : 'causando dano')).join(' e ')}); ${fragile.length ? `caem de uma vez: ${list(fragile.map((e) => `${e.card.name} (${e.card.hp} HP)`))}` : 'seu banco aguenta um ataque'}${fragile2.length ? `; caem em 2 ataques: ${list(fragile2.map((e) => `${e.card.name} (${e.card.hp} HP)`))}` : ''}.` });
  }

  // 5) Prender o seu Pokémon no Ativo (não pode recuar)
  const traps = opp.entries.filter((e) => (e.card.attacks ?? []).some((a) => /the defending pok[eé]mon can.t retreat|your opponent.s active pok[eé]mon can.t retreat/i.test(a.effect ?? '')));
  if (traps.length) {
    const copies = traps.reduce((s2, e) => s2 + e.count, 0);
    const mySwitch = me.entries.filter((e) => /switch (your active|this pok[eé]mon|1 of your benched)|no retreat cost/i.test(e.card.text)).reduce((s2, e) => s2 + e.count, 0);
    const sev = clamp(copies / 5 * (mySwitch >= 4 ? 0.5 : 1));
    if (sev >= 0.2) axes.push({ key: 'trap', severity: sev, evidence: `${list(traps.map((e) => `${e.card.name} (${e.count}x)`))} prende o seu Ativo (não pode recuar); você tem ${mySwitch} carta(s) de troca.` });
  }

  // 6) Trava das suas habilidades
  const aLock = oppTags.filter((t) => t.kind === 'ABILITY_LOCK');
  if (aLock.length) {
    const hit = me.entries.filter((e) => e.card.abilities?.length && aLock.some((t) => matches(t.sel, e.card)));
    if (hit.length) axes.push({ key: 'ability_lock', severity: clamp(hit.length / 4), evidence: `${list(aLock.map((t) => t.card.name))} desliga habilidades de ${list(hit.map((e) => e.card.name))}.` });
  }

  return { axes: axes.sort((a, b) => b.severity - a.severity), tips, opp };
}

// Counters de disrupção que uma carta oferece (etiquetas novas, lidas do texto)
export function counterTags(card) {
  const out = [];
  for (const a of card.abilities ?? []) {
    const t = a.effect ?? '';
    const draw = t.match(/draw (\d+) cards|draw cards until you have (\d+)/i);
    if (draw) out.push({ kind: 'DRAW_ABILITY', name: a.name, amount: +(draw[1] ?? draw[2]), repeat: /once during your turn/i.test(t) && !/only if|if any of your/i.test(t) });
    if (/attach/i.test(t) && /energy/i.test(t) && /(from your deck|from your discard|search your deck)/i.test(t)) out.push({ kind: 'ENERGY_ACCEL', name: a.name });
    if (/prevent all damage (counters )?(from being placed )?on (your )?benched|damage counters .*your benched pok[eé]mon/i.test(t) && /prevent/i.test(t)) out.push({ kind: 'BENCH_SHIELD', name: a.name });
  }
  if (card.trainerType === 'Supporter' && /search your deck for (up to \d+ )?(basic )?pok[eé]mon|search your deck for (up to \d+ )?(cards|a card)/i.test(card.text)) out.push({ kind: 'SUPPORTER_SEARCH', name: card.name });
  if (card.category === 'Trainer' && /attach (up to \d+ )?basic .*energy cards? from your discard pile|basic energy cards? from your discard pile into your hand/i.test(card.text)) out.push({ kind: 'ENERGY_RECOVERY', name: card.name });
  if (card.category === 'Trainer' && /prevent all damage counters from being placed on .*benched|damage counters .*benched pok[eé]mon/i.test(card.text) && /prevent/i.test(card.text)) out.push({ kind: 'BENCH_SHIELD', name: card.name });
  for (const t of extractTags(card)) {
    if (t.kind === 'BENCH_WALL') out.push({ kind: 'BENCH_WALL', name: t.name });
    if (t.kind === 'HEAL' && t.source !== 'attack') out.push({ kind: 'HEAL', name: t.name, amount: t.amount, scope: t.scope });
    if (t.kind === 'SWITCH' && t.source !== 'attack') out.push({ kind: 'SWITCH', name: t.name });
    if (t.kind === 'ENERGY_MOVE' && t.source !== 'attack') out.push({ kind: 'ENERGY_MOVE', name: t.name });
  }
  return out;
}

// Requisitos escritos na carta, conferidos contra o SEU deck. Retorna { ok, factor, note }.
const SYMT = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon' };
export function requirements(card, me, opp = null) {
  const t = (card.text ?? '').replace(/\([^)]*\)/g, ' ');
  const notes = [];
  let factor = 1;
  // Tera / Ancient / Future: "se você tem Pokémon Tera em jogo", "no seu Pokémon Ancient", "Future Pokémon in play"
  const trait = t.match(/(?:if you have any|your|of your) (tera|ancient|future) pok[eé]mon/i) || (/(only if|as long as) /i.test(t) && t.match(/(tera|ancient|future) pok[eé]mon in play/i));
  if (trait) {
    const kind = trait[1].toLowerCase();
    const has = me.entries.some((e) => e.card.category === 'Pokemon' && (kind === 'tera' ? TERA.has(e.card.name) : kind === 'ancient' ? ANCIENT.has(e.card.name) : isFuture(e.card.name)));
    const PT = { tera: 'Tera', ancient: 'Ancient (Antigo)', future: 'Future (Futuro)' }[kind];
    if (!has) {
      if (/only if|you can use this card only/i.test(t) || card.category === 'Trainer') return { ok: false, note: `exige Pokémon ${PT} — seu deck não tem` };
      factor *= 0.5; notes.push(`parte do efeito depende de Pokémon ${PT}, que seu deck não tem`);
    }
  }
  const inPlay = t.match(/if you have (?:any )?([A-Z][\w' .-]+?) in play/);
  if (inPlay && !/pok[eé]mon/i.test(inPlay[1]) && !me.names.has(inPlay[1].trim())) return { ok: false, note: `exige ${inPlay[1].trim()} em jogo — seu deck não tem` };
  const discE = t.match(/discard a basic \{([A-Z])\} energy/i);
  if (discE && !(me.energyByType?.[SYMT[discE[1].toUpperCase()]] > 0)) return { ok: false, note: `precisa descartar energia ${SYMT[discE[1].toUpperCase()]} — seu deck não tem` };
  const typedTarget = t.match(/(?:to|from|on) (?:1 of |each of |all of )?your \{([A-Z])\} pok[eé]mon/i);
  if (typedTarget && !me.entries.some((e) => (e.card.types ?? []).includes(SYMT[typedTarget[1].toUpperCase()]))) return { ok: false, note: `só funciona em Pokémon ${SYMT[typedTarget[1].toUpperCase()]} — seu deck não tem` };
  const stageTarget = t.match(/your stage (1|2) pok[eé]mon/i);
  if (stageTarget && !me.entries.some((e) => e.card.stage === `Stage${stageTarget[1]}`)) return { ok: false, note: `só funciona em Pokémon de Estágio ${stageTarget[1]} — seu deck não tem` };
  const typedE = t.match(/basic \{([A-Z])\} energy cards? from your discard/i);
  if (typedE && !(me.energyByType?.[SYMT[typedE[1].toUpperCase()]] > 0)) return { ok: false, note: `recupera só energia ${SYMT[typedE[1].toUpperCase()]} — seu deck não tem` };
  if (/only when it is the last card in your hand/i.test(t)) { factor *= 0.55; notes.push('só quando for a última carta da mão'); }
  // Custo de descarte ("só se descartar N cartas da mão")
  const disc = t.match(/only if you discard (\d+) (?:other )?cards? from your hand|discard (\d+) cards? from your hand/i);
  if (disc) { const n = +(disc[1] ?? disc[2]); factor *= n >= 3 ? 0.85 : 0.93; notes.push(`custa descartar ${n} carta${n > 1 ? 's' : ''} da mão`); }
  // "Não soma": só 1 habilidade com esse nome por turno — se você já tem, a cópia nova não acrescenta
  const once = t.match(/can.t use more than 1 (.+?) ability each turn/i);
  if (once && me.entries.some((e) => e.card.name !== card.name && (e.card.abilities ?? []).some((a) => a.name.toLowerCase() === once[1].toLowerCase()))) { factor *= 0.3; notes.push(`não soma: você já tem a habilidade "${once[1]}" e só uma funciona por turno`); }
  if (/can.t be applied more than once|once per game/i.test(t)) notes.push('efeito só 1 vez por jogo');
  // Primeiro turno / ir primeiro ou segundo
  if (/if you go (first|second)[^.]*can.t|during your first turn[^.]*can.t|can.t [^.]*during your first turn/i.test(t)) { factor *= 0.95; notes.push('não funciona no seu 1º turno em algumas situações (quem começa / quem vai segundo)'); }
  // Depende do tabuleiro do oponente ("se o oponente tiver Pokémon X em jogo")
  const oppAny = t.match(/if your opponent has any ([^,.]+?) in play/i);
  if (oppAny && opp) {
    const sel = parseSelector(oppAny[1]);
    const hasIt = Object.keys(sel).length && !sel.unknown ? opp.entries.some((e) => matches(sel, e.card)) : null;
    if (hasIt === false) {
      if (/only if/i.test(t)) return { ok: false, note: `só funciona se o oponente tiver ${oppAny[1]} — este deck não tem` };
      factor *= 0.5; notes.push(`parte do efeito depende de o oponente ter ${oppAny[1]} — este deck não tem`);
    }
  }
  const oppBench = t.match(/if your opponent has (\d+) or more benched pok[eé]mon/i);
  if (oppBench && opp && !opp.bigBench && +oppBench[1] > 4) { factor *= 0.8; notes.push(`depende de o oponente ter ${oppBench[1]}+ Pokémon no banco`); }
  // Tamanho da mão
  const hand = t.match(/if you have (\d+) or (more|fewer) cards in your hand/i);
  if (hand) { factor *= 0.8; notes.push(`depende de você ter ${hand[1]} ou ${hand[2] === 'more' ? 'mais' : 'menos'} cartas na mão`); }
  if (/only if you have more prize cards remaining than your opponent/i.test(t)) { factor *= 0.7; notes.push('só quando você estiver atrás nos prêmios'); }
  return { ok: true, factor, note: notes.join('; ') };
}

const WHY = {
  DRAW_ABILITY: (t, ax) => `Habilidade "${t.name}" compra ${t.amount} carta(s)${t.repeat ? ' todo turno' : ''} sem depender de Itens nem da mão — responde a ${ax.label.toLowerCase()}.`,
  SUPPORTER_SEARCH: (t, ax) => `"${t.name}" busca no deck sendo Supporter — funciona mesmo com ${ax.label.toLowerCase()}.`,
  ENERGY_ACCEL: (t) => `Habilidade "${t.name}" liga energia direto do deck/descarte — repõe o que o oponente tira.`,
  ENERGY_RECOVERY: (t) => `"${t.name}" recupera energia do descarte — repõe o que o oponente tira.`,
  BENCH_SHIELD: (t) => `"${t.name}" protege o seu banco de contadores de dano.`,
  BENCH_WALL: (t) => `"${t.name}" protege no banco contra o dano espalhado.`,
  HEAL: (t) => `"${t.name}" cura ${t.amount >= 999 ? 'todo o dano' : `${t.amount}`}${t.scope === 'all' ? ' de todos os seus Pokémon' : ''} — desfaz o dano espalhado antes de virar nocaute.`,
  SWITCH: (t) => `"${t.name}" troca/zera o recuo — tira o seu Pokémon preso do Ativo.`,
  ENERGY_MOVE: (t) => `"${t.name}" move energia entre os seus Pokémon — redistribui depois de perder energia.`,
};

// Valor de uma carta contra os eixos diagnosticados
export function disruptionValue(card, diag, me) {
  const reasons = [];
  const req = me ? requirements(card, me, diag.opp) : { ok: true, factor: 1, note: '' };
  if (!req.ok) return [];
  const itemLock = diag.axes.find((a) => a.key === 'item_lock');
  for (const t of counterTags(card)) {
    for (const ax of diag.axes) {
      if (!AXES[ax.key].counters.includes(t.kind) || ax.severity < 0.2) continue;
      // Regra do jogo: "colocar contadores" não é "causar dano". Battle Cage para contadores; prevenir dano não para.
      if (ax.key === 'spread' && t.kind === 'BENCH_WALL' && !(ax.kinds ?? []).includes('damage')) continue;
      if (ax.key === 'spread' && t.kind === 'BENCH_SHIELD' && !(ax.kinds ?? []).includes('counters')) continue;
      let strength = req.factor;
      if (t.kind === 'DRAW_ABILITY') strength *= clamp(t.amount / 3) * (t.repeat ? 1 : 0.6);
      if (t.kind === 'HEAL') strength *= clamp((t.amount >= 999 ? 120 : t.amount) / 60) * (t.scope === 'all' ? 1 : 0.6);
      if (t.kind === 'ENERGY_MOVE') strength *= 0.6;
      // Item é justamente o que a trava de Itens bloqueia
      const lockedItem = card.trainerType === 'Item' && itemLock && itemLock.severity >= 0.3;
      if (lockedItem) strength *= 0.35;
      // Supporter que busca o que o seu deck realmente precisa vale mais
      if (t.kind === 'SUPPORTER_SEARCH' && me?.mainAttacker) {
        const finds = /pok[eé]mon ex/i.test(card.text) ? me.entries.filter((e) => e.card.isEx).map((e) => e.card.name)
          : /evolves from/i.test(card.text) ? me.entries.filter((e) => e.card.category === 'Pokemon' && e.card.stage && e.card.stage !== 'Basic' && (!/has no abilities/i.test(card.text) || !(e.card.abilities ?? []).length)).map((e) => e.card.name) : [];
        if (finds.length) t.finds = finds;
      }
      const value = 42 * ax.severity * strength;
      if (value >= 6) reasons.push({ kind: 'ANTI_' + ax.key.toUpperCase(), axis: ax.key, value,
        why: WHY[t.kind](t, AXES[ax.key]) + (t.finds ? ` No seu deck, encontra: ${[...new Set(t.finds)].slice(0, 3).join(', ')}.` : '') + (req.note ? ` (Atenção: ${req.note}.)` : '') + (lockedItem ? ' (Mas é Item: fica travado pela própria trava de Itens.)' : '') });
    }
  }
  // um motivo por eixo (o mais forte)
  const best = {};
  for (const r of reasons) if (!best[r.axis] || r.value > best[r.axis].value) best[r.axis] = r;
  return Object.values(best);
}
