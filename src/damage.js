// Função ÚNICA de dano: usada pelo motor, pelo simulador de prêmios e pela análise de risco.
// Lê as condições do texto do ataque e calcula o dano CONTRA UM ALVO ESPECÍFICO.
// Quando não entende uma condição, não chuta: conta o bônus como 0 e registra em `unparsed`.
import { parseSelector, matches, attackDamage, TERA, ANCIENT, isFuture } from './tags.js';

export const unparsed = new Map(); // texto da condição -> nº de vezes (relatório de qualidade)
const note = (k) => unparsed.set(k, (unparsed.get(k) ?? 0) + 1);

const SYMK = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless' };
const ents = (deck) => deck?.entries ?? [];
const cnt = (deck, f) => ents(deck).filter((x) => f(x.card)).reduce((n, x) => n + x.count, 0);
const inPlayCount = (deck, f, max = 6) => Math.min(max, ents(deck).filter((x) => x.card.category === 'Pokemon' && f(x.card)).reduce((n, x) => n + Math.min(x.count, 2), 0));
const eOf = (deck, T) => deck?.energyByType?.[T] ?? cnt(deck, (c) => c.isBasicEnergy && c.name === `${T} Energy`);
const quoted = (s) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
// nomes citados ("your Drifloon and Drifblim", "Pikachu and Pikachu ex") → predicado por nome
const namesPred = (txt) => { const ns = txt.split(/,\s*|\s+and\s+|\s+or\s+/).map((x) => x.trim()).filter(Boolean); return (c) => ns.some((n) => c.name === n || c.name === `${n} ex`); };

// Probabilidade (0–1) de uma condição "If …, this attack does N more damage" ser verdade, lida do deck de quem
// ataca e do alvo. null = condição desconhecida (vira lacuna no relatório; não chuta).
export function condProb(cond, attacker, target, ctx = {}) {
  const c = cond.replace(/[’]/g, "'").trim();
  const deck = ctx.deck;
  const yes = (b, pTrue = 1, pFalse = 0) => (b ? pTrue : pFalse);
  let m;
  // --- energia ligada neste Pokémon
  if ((m = c.match(/^this pok[eé]mon has any \{([A-Z])\} energy attached/i))) return yes(eOf(deck, SYMK[m[1]]) > 0 || (deck?.anyEnergy ?? 0) > 0);
  if ((m = c.match(/^this pok[eé]mon has (\d+) or more \{([A-Z])\} energy attached/i))) return eOf(deck, SYMK[m[2]]) >= 2 * +m[1] ? 0.8 : eOf(deck, SYMK[m[2]]) ? 0.4 : 0;
  if (/^this pok[eé]mon has at least \d+ extra energy attached/i.test(c)) return deck?.engineAccel ? 0.6 : 0.3;
  if (/^this pok[eé]mon has any special energy attached/i.test(c)) return yes((deck?.counts?.specialEnergy ?? 0) > 0, 0.8);
  if (/^this pok[eé]mon has any team rocket's energy attached/i.test(c)) return yes(ents(deck).some((x) => x.card.name === "Team Rocket's Energy"), 0.8);
  if (/^this pok[eé]mon has more energy attached than/i.test(c)) return 0.5;
  if (/same amount of energy attached/i.test(c)) return 0.3;
  if (/^you have at least (\d+) \{([A-Z])\} energy in play/i.test(c)) { m = c.match(/^you have at least (\d+) \{([A-Z])\} energy in play/i); return eOf(deck, SYMK[m[2]]) >= 2 * +m[1] ? 0.7 : 0.3; }
  if (/^you have (\d+) or more energy in play/i.test(c)) return 0.8;
  // --- Ferramenta / Estádio
  if (/^this pok[eé]mon has a pok[eé]mon tool attached/i.test(c)) { const t = deck?.counts?.tool ?? 0; return t >= 3 ? 0.8 : t ? 0.5 : 0; }
  if (/^your opponent's active pok[eé]mon has a pok[eé]mon tool attached/i.test(c)) return 0.5;
  if (/^a stadium is in play/i.test(c)) { const st = deck?.counts?.stadium ?? 0; return st >= 2 ? 0.9 : st ? 0.7 : 0.5; }
  if (/^you have a stadium in play/i.test(c)) { const st = deck?.counts?.stadium ?? 0; return st >= 2 ? 0.8 : st ? 0.5 : 0; }
  // --- estado deste Pokémon
  if (/^this pok[eé]mon has no damage counters on it/i.test(c)) return ctx.selfDamaged ? 0.2 : 0.6;
  if (/^this pok[eé]mon has (\d+) or more damage counters on it/i.test(c)) return ctx.selfDamaged ? 1 : 0.3;
  if (/^this pok[eé]mon's remaining hp is \d+ or less/i.test(c)) return 0.2;
  if (/^this pok[eé]mon is (burned or )?poisoned/i.test(c)) return yes(ents(deck).some((x) => /the new active pok[eé]mon is now poisoned/i.test(x.card.text ?? '')), 1, 0.1);
  if (/^this pok[eé]mon was healed during this turn/i.test(c)) return yes(ents(deck).some((x) => /\bheal\b/i.test(x.card.text ?? '') && x.card.name !== attacker?.name), 0.5);
  if (/^this pok[eé]mon moved from your bench to the active spot this turn/i.test(c)) return 0.8; // recuar/trocar já conta
  if (/^this pok[eé]mon evolved from .+ during this turn/i.test(c)) return 0.6;
  if (/^this pok[eé]mon was damaged by an attack during your opponent's last turn/i.test(c)) return 0.5;
  if (/^(this pok[eé]mon|1 of your other .+) used .+ during your last turn/i.test(c)) return 0.4;
  // --- seu banco / seu deck
  if ((m = c.match(/^(.+?) (?:is|are) on your bench/i))) {
    const who = m[1].replace(/^a pok[eé]mon that has /i, '');
    if (/in its name/i.test(who)) { const q = quoted(who)[0]; return yes(q && ents(deck).some((x) => x.card.name.includes(q))); }
    return yes(m[1].split(/\s+and\s+/).every((n) => ents(deck).some((x) => x.card.name === n.trim())));
  }
  if ((m = c.match(/^any of your benched (.+?) have any damage counters/i))) return yes(ents(deck).some((x) => x.card.name === m[1].trim()), 0.4);
  if (/^your benched pok[eé]mon have any damage counters/i.test(c)) return ctx.ownBenchCounters ? 1 : 0.5;
  if (/^all of your benched pok[eé]mon have at least 1 damage counter/i.test(c)) return 0.2;
  if (/^you have any tera pok[eé]mon on your bench/i.test(c)) return yes(ents(deck).some((x) => TERA.has(x.card.name)));
  if ((m = c.match(/^you have any stage (1|2) (?:\{([A-Z])\} )?pok[eé]mon on your bench/i))) return yes(ents(deck).some((x) => x.card.stage === `Stage${m[1]}` && (!m[2] || (x.card.types ?? []).includes(SYMK[m[2]]))));
  if (/^your benched pok[eé]mon have any shadowy/i.test(c)) return yes(ents(deck).some((x) => /shadowy/i.test(x.card.name)), 0.7);
  if (/^you have \d+ or more pok[eé]mon that have the .+ ability in your discard pile/i.test(c)) return 0.3;
  if ((m = c.match(/^(.+?) is in your discard pile/i))) return yes(ents(deck).some((x) => x.card.name === m[1].trim()), 0.7);
  if ((m = c.match(/^you have (\d+) or more basic \{([A-Z])\} energy cards in your discard pile/i))) return eOf(deck, SYMK[m[2]]) >= +m[1] ? 0.4 : 0;
  if (/^there are \d+ or fewer cards in your deck/i.test(c)) return 0.05;
  if ((m = c.match(/^you played (.+?) from your hand during this turn/i))) {
    const what = m[1];
    if (/supporter card that has "team rocket"/i.test(what)) return yes(ents(deck).some((x) => x.card.trainerType === 'Supporter' && /team rocket/i.test(x.card.name)), 0.7);
    if (/future supporter/i.test(what)) return yes(ents(deck).some((x) => x.card.trainerType === 'Supporter' && /future/i.test(x.card.text ?? '')), 0.5);
    return yes(ents(deck).some((x) => x.card.name === what.trim()), 0.7);
  }
  if ((m = c.match(/^any of your (.+?) pok[eé]mon were knocked out/i))) return 0.5;
  if (/^any of your pok[eé]mon in play are the same type as/i.test(c)) return 0.5;
  // --- alvo / oponente
  if (/^your opponent's active pok[eé]mon has no retreat cost/i.test(c)) return yes((target?.retreat ?? 1) === 0);
  if (/^the retreat cost of your opponent's active pok[eé]mon is \{c\}\{c\} or more/i.test(c)) return yes((target?.retreat ?? 0) >= 2);
  if ((m = c.match(/^your opponent's active pok[eé]mon has \{([A-Z])\} resistance/i))) return yes((target?.resistances ?? []).some((r) => r.type === SYMK[m[1]]));
  if ((m = c.match(/^your opponent has any \{([A-Z])\} pok[eé]mon in play/i))) return yes((target?.types ?? []).includes(SYMK[m[1]]), 1, 0.3);
  if ((m = c.match(/^your opponent has any (tera|ancient|future) pok[eé]mon in play/i))) { const k = m[1].toLowerCase(); const is = target && (k === 'tera' ? TERA.has(target.name) : k === 'ancient' ? ANCIENT.has(target.name) : isFuture(target.name)); return yes(is, 1, 0.2); }
  if ((m = c.match(/^your opponent has (\d+) or more benched pok[eé]mon/i))) return (ctx.defenderBench ?? 4) >= +m[1] ? 0.8 : 0.4;
  // --- prêmios e mão
  if (/^your opponent has (exactly \d+|\d+ or fewer) prize cards? remaining/i.test(c)) { m = c.match(/(exactly (\d+)|(\d+) or fewer)/i); return m[2] ? 0.15 : +m[3] >= 4 ? 0.5 : 0.35; }
  if (/^you have exactly 6 prize cards remaining/i.test(c)) return 0.2;
  if (/^your opponent has \d+ or fewer cards in their hand/i.test(c)) return 0.5;
  if (/^you have the same number of cards in your hand as your opponent/i.test(c)) return 0.2;
  if (/^you have no cards in your hand/i.test(c)) return 0.2;
  return null;
}

// Quantas vezes um "for each" costuma contar, no contexto do deck que ataca
export function multiplier(effect, deck, defenderBench = 5, ctx = {}) {
  const maxInPlay = deck?.bigBench ? 9 : 6;
  const e = effect.replace(/[’]/g, "'");
  let m;
  // Custo de recuo do alvo, cartas na mão, descarte, nomes e estágios em jogo, cartas descartadas pelo ataque
  if (/for each \{c\} in your opponent's active pok[eé]mon's retreat cost/i.test(e)) return ctx.target?.retreat ?? 1;
  if (/for each damage counter on all of your opponent's pok[eé]mon/i.test(e)) return (ctx.targetCounters ?? 0) + 3;
  if (/for each card in your opponent's hand/i.test(e)) return 5;
  if (/for each card in your hand/i.test(e)) return 5;
  if (/for each trainer card you find there/i.test(e)) return 3;
  if (/for each item card in your opponent's discard pile/i.test(e)) return 4;
  if (/for each pok[eé]mon tool attached to all pok[eé]mon/i.test(e)) return Math.min(3, ((deck?.counts?.tool ?? 0) > 0 ? 1 : 0) + 1);
  if (/for each special energy card attached to this pok[eé]mon/i.test(e)) return (deck?.counts?.specialEnergy ?? 0) > 0 ? 1 : 0;
  if (/for each supporter card that has "team rocket" in its name in your discard pile/i.test(e)) return Math.min(4, cnt(deck, (c) => c.trainerType === 'Supporter' && /team rocket/i.test(c.name)) / 2);
  if (/for each ancient card in your discard pile/i.test(e)) return 4;
  if ((m = e.match(/for each (.+?) card in your discard pile/i))) return Math.min(3, cnt(deck, (c) => c.name === m[1].trim()));
  if ((m = e.match(/for each pok[eé]mon in your discard pile that has the (.+?) attack/i))) return Math.min(3, cnt(deck, (c) => (c.attacks ?? []).some((a) => a.name === m[1])) / 2);
  if ((m = e.match(/reveal the (?:top|bottom) (\d+) cards of your deck[\s\S]*?for each (?:pok[eé]mon you find there that has the (.+?) attack|(future) card you find there)/i))) {
    const f = m[2] ? (c) => (c.attacks ?? []).some((a) => a.name === m[2]) : (c) => isFuture(c.name);
    return +m[1] * cnt(deck, f) / 60;
  }
  if ((m = e.match(/for each of your ((?:\{([A-Z])\} )|(evolution |stage (1|2) |ancient |future |tera ))pok[eé]mon (in play|on your bench)/i))) {
    const T = m[2] && SYMK[m[2]];
    const kind = (m[3] ?? '').trim().toLowerCase();
    const f = (c) => (T ? (c.types ?? []).includes(T) : kind === 'evolution' ? c.stage && c.stage !== 'Basic' : kind.startsWith('stage') ? c.stage === `Stage${m[4]}` : kind === 'ancient' ? ANCIENT.has(c.name) : kind === 'future' ? isFuture(c.name) : kind === 'tera' ? TERA.has(c.name) : false);
    return Math.max(1, inPlayCount(deck, f, m[5] === 'on your bench' ? maxInPlay - 1 : maxInPlay));
  }
  if ((m = e.match(/for each of your (?:benched )?(.+?) in play/i)) && !/pok[eé]mon/i.test(m[1])) return Math.max(1, inPlayCount(deck, namesPred(m[1]), maxInPlay));
  if ((m = e.match(/for each of your benched ([A-Z][\w' -]+?)\./i)) && !/pok[eé]mon/i.test(m[1])) return inPlayCount(deck, namesPred(m[1]), maxInPlay - 1);
  if ((m = e.match(/for each (stage (1|2)|evolution) pok[eé]mon on your bench/i))) return inPlayCount(deck, (c) => (m[2] ? c.stage === `Stage${m[2]}` : c.stage && c.stage !== 'Basic'), maxInPlay - 1);
  if ((m = e.match(/for each of your pok[eé]mon that has "([^"]+)" in its name/i))) return Math.max(1, inPlayCount(deck, (c) => c.name.includes(m[1]), maxInPlay) / 2);
  if ((m = e.match(/for each pok[eé]mon in play that has "([^"]+)" or "([^"]+)" in its name/i))) return Math.max(1, inPlayCount(deck, (c) => c.name.includes(m[1]) || c.name.includes(m[2]), maxInPlay));
  if (/for each of your pok[eé]mon that has any damage counters on it/i.test(e)) return 2;
  if (/opponent flips a coin for each of their benched pok[eé]mon[\s\S]*?for each tails/i.test(e)) return defenderBench / 2;
  if (/put up to (\d+) damage counters on this pok[eé]mon[\s\S]*?for each damage counter you placed/i.test(e)) return Math.min(+e.match(/put up to (\d+)/i)[1], Math.max(1, Math.floor(((ctx.attacker?.hp ?? 100) - 10) / 10 / 2)));
  // Descarte pelo próprio ataque: "Discard all/up to N … and this attack does X for each card you discarded"
  if (/for each card you (discarded|revealed) in this way/i.test(e)) {
    const up = e.match(/(?:discard|reveal) up to (\d+)/i);
    if (up) return +up[1];
    if (/discard all \{([A-Z])\} energy from this pok[eé]mon/i.test(e)) return 2;
    if (/discard any (?:amount|number) of/i.test(e)) return 3;
    return 2;
  }
  // Estados que dependem do jogo: usa o valor REALISTA (o que o deck realmente produz), não o máximo
  if (/for each damage counter on your opponent.s active/i.test(e)) return ctx.targetCounters ?? 0;
  if (/for each damage counter on (all of )?your benched/i.test(e)) return ctx.ownBenchCounters ?? 0;
  if (/for each damage counter on this pok[eé]mon/i.test(e)) return ctx.selfCounters ?? 2;
  if (/for each special condition/i.test(e)) return ctx.oppConditions ?? 0;
  if (/for each prize card your opponent took during their last turn/i.test(e)) return 2;
  if (/flip a coin for each/i.test(e)) return 1.5; // média de caras com ~3 energias
  if (/flip \d+ coins/i.test(e)) { const n = +e.match(/flip (\d+) coins/i)[1]; return n / 2; }
  if (/flip a coin until you get tails/i.test(e)) return 1; // valor esperado ~1 cara
  if (/for each heads/i.test(e)) return 1.5;
  // "para cada um dos seus Pokémon de X em jogo" (Team Rocket's Spidops, Erika's Victreebel)
  const own = e.replace(/[’]/g, "'").match(/for each of your (?:benched )?(team rocket|[a-z.]+)'s pok[eé]mon in play/i);
  if (own) {
    const key = own[1].toLowerCase();
    const n = (deck?.entries ?? []).filter((x) => x.card.category === 'Pokemon' && x.card.owner && x.card.owner.toLowerCase() === key).reduce((s2, x) => s2 + Math.min(x.count, 2), 0);
    return Math.min(maxInPlay, Math.max(1, n)); // o próprio atacante conta
  }
  // "para cada Pokémon de X que você descartou" do topo (Misty's Gyarados: descarta 7)
  const milled = e.replace(/[’]/g, "'").match(/discard the top (\d+) cards of your deck[^.]*for each (team rocket|[a-z.]+)'s pok[eé]mon that you discarded/i);
  if (milled) { const key = milled[2].toLowerCase(); const n = (deck?.entries ?? []).filter((x) => x.card.owner?.toLowerCase() === key).reduce((s2, x) => s2 + x.count, 0); return +milled[1] * n / 60; }
  // "por Pokémon seu no banco que tenha energia {X} ligada": só se o deck tem energia X
  const withE = e.match(/for each of your benched pok[eé]mon that has any \{([A-Z])\} energy attached/i);
  if (withE) {
    const T = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal' }[withE[1]];
    const n = (deck?.energyByType?.[T] ?? 0);
    return n >= 6 ? Math.min(3, maxInPlay - 1) : n >= 3 ? 1 : 0;
  }
  // "por Pokémon seu em jogo que tenha o ataque X" (ex.: Round): só conta quem tem o ataque
  const same = e.match(/for each of your pok[eé]mon in play that has the (.+?) attack/i);
  if (same) return 1 + (deck?.entries ?? []).filter((x) => (x.card.attacks ?? []).some((a) => a.name.toLowerCase() === same[1].toLowerCase())).reduce((n, x) => n + Math.min(x.count, 2), 0);
  // Contagens de tabuleiro
  if (/for each of your basic pok[eé]mon in play/i.test(e)) return Math.min(maxInPlay, deck?.counts?.basic ?? maxInPlay);
  if (/for each benched pok[eé]mon \(both|for each benched pok[eé]mon .both|for each benched pok[eé]mon\s*\./i.test(e)) return maxInPlay - 1 + defenderBench;
  if (/for each pok[eé]mon tool attached to all of your pok[eé]mon/i.test(e)) return Math.min(2, (deck?.counts?.tool ?? 0) > 0 ? 2 : 0);
  if (/for each of your benched pok[eé]mon/i.test(e)) return maxInPlay - 1;
  if (/for each of your pok[eé]mon in play/i.test(e)) return maxInPlay;
  if (/for each of your opponent.s benched/i.test(e)) return defenderBench;
  if (/for each of your opponent.s pok[eé]mon ex/i.test(e)) return 3;
  if (/for each prize card/i.test(e)) return 4;
  if (/for each energy attached to both active/i.test(e)) return 5; // ~3 dele + ~2 do seu Ativo
  if (/for each (basic )?(\{[a-z]\} )?energy|for each .*energy attached/i.test(e)) return 3;
  // Desconhecido: conservador (não infla) e registra a lacuna
  if (/for each/i.test(e)) { note(`for each: ${e.slice(0, 80)}`); return 1; }
  return 1;
}


/**
 * Dano de `attack` (usado por `attacker`) em `target`.
 * ctx: { deck: perfil do deck que ataca, oppTaken: prêmios que o OPONENTE de quem ataca já pegou,
 *        selfDamaged: o atacante tem contadores de dano, targetDamaged, defenderBench }
 */
export function damageVs(attack, attacker, target, ctx = {}) {
  const d = String(attack.damage ?? '');
  const n = parseInt(d, 10) || 0;
  const eff = (attack.effect ?? '').replace(/\([^)]*\)/g, ' ');
  const notes = [];
  let dmg = 0;

  if (/[×x]$/.test(d)) {
    if (/for each prize card your opponent has taken/i.test(eff)) { dmg = n * (ctx.oppTaken ?? 0); notes.push(`${n}×${ctx.oppTaken ?? 0} prêmios`); }
    else dmg = n * multiplier(eff, ctx.deck, ctx.defenderBench, { ...ctx, target, attacker });
  } else if (d.endsWith('+')) {
    dmg = n;
    const cond = eff.match(/if (?:your opponent.s active pok[eé]mon|the defending pok[eé]mon) (?:already )?(is|has) ([^,]+?), this attack does (\d+) more damage/i);
    const coin = eff.match(/flip a coin\. if heads, this attack does (\d+) more damage/i);
    const afterKO = eff.match(/if any of your pok[eé]mon were knocked out[^,]*during your opponent.s last turn, this attack does (\d+) more damage/i);
    const benchType = eff.match(/if you have any \{([A-Z])\} pok[eé]mon on your bench, this attack does (\d+) more damage/i);
    const behind = eff.match(/if you have more prize cards remaining than your opponent, this attack does (\d+) more damage/i);
    const self = eff.match(/if this pok[eé]mon has any damage counters on it, this attack does (\d+) more damage/i);
    const each = eff.match(/(\d+) more damage for each/i);
    const general = eff.match(/if ([^,]+?), this attack does (\d+) more damage/i);
    const opt1 = eff.match(/you may do (\d+) more damage\.\s*if you do,?\s*([^.]+)/i);
    const opt2 = eff.match(/you may ([^.]+?) (?:and|to) have this attack do (\d+) more damage/i);
    const opt3 = eff.match(/you may ([^.]+?)\.\s*if you (?:do|discarded any cards in this way), this attack does (\d+) more damage/i);
    const optional = opt1 ? { more: +opt1[1], cost: opt1[2].trim() } : opt2 ? { more: +opt2[2], cost: opt2[1].trim() } : opt3 ? { more: +opt3[2], cost: opt3[1].trim() } : null;
    const c2 = eff.match(/flip (\d+) coins\. if both of them are heads, this attack does (\d+) more damage/i);
    const c3 = eff.match(/flip 3 coins\. if 1 of them is heads, this attack does (\d+) more damage\. if 2 of them are heads, this attack does (\d+) more damage\. if all of them are heads, this attack does (\d+) more damage/i);
    const coins = c2 ? { ev: +c2[2] / 4 } : c3 ? { ev: (3 * +c3[1] + 3 * +c3[2] + +c3[3]) / 8 } : null;
    if (coin) { dmg += +coin[1] / 2; notes.push('moeda: média'); }
    else if (afterKO) { dmg += ctx.afterKO ? +afterKO[1] : +afterKO[1] / 2; }
    else if (benchType) {
      const T = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless' }[benchType[1]];
      if ((ctx.deck?.entries ?? []).some((x) => x.card.category === 'Pokemon' && (x.card.types ?? []).includes(T))) dmg += +benchType[2];
    } else if (behind) { dmg += +behind[1] / 2; }
    else if (cond) {
      const [, verb, phrase, more] = cond;
      let ok;
      if (/damage counters/i.test(phrase)) ok = !!ctx.targetDamaged || (ctx.targetCounters ?? 0) > 0;
      else if (/special condition/i.test(phrase)) ok = (ctx.oppConditions ?? 0) > 0;
      else if (/(poisoned|burned|asleep|confused|paralyzed)/i.test(phrase)) ok = false; // exige status que não modelamos
      else {
        const sel = parseSelector(`${verb === 'has' ? 'Pokémon that has ' : ''}${phrase}`);
        ok = Object.keys(sel).length && !sel.unknown ? matches(sel, target) : null;
        if (ok === null) { const p = condProb(`your opponent's active pokémon ${verb} ${phrase}`, attacker, target, ctx); if (p === null) note(phrase); ok = p !== null && p >= 0.5; }
      }
      if (ok) { dmg += +more; notes.push(`+${more} (${phrase.replace(/^an? /i, '')})`); }
    } else if (self) {
      if (ctx.selfDamaged) { dmg += +self[1]; notes.push('ferido'); }
    } else if (each) {
      dmg += +each[1] * multiplier(eff, ctx.deck, ctx.defenderBench, { ...ctx, target, attacker });
    } else if (/flip a coin until you get tails/i.test(eff)) {
      dmg += +(eff.match(/(\d+) more damage/i)?.[1] ?? 0);
    } else if (/if this pok[eé]mon was damaged by an attack during your opponent.s last turn, this attack does that much more damage/i.test(eff)) {
      const add = ctx.selfDamageTaken ?? 50; dmg += add; notes.push(`+${add} (dano que ele recebeu no último turno, estimado)`);
    } else if (optional) {
      // "You may do N more damage. If you do, …" / "You may discard … and have this attack do N more damage": é escolha do jogador
      dmg += +optional.more; notes.push(`+${optional.more} (opcional: ${optional.cost})`);
    } else if (coins) {
      dmg += coins.ev; notes.push('moedas: média');
    } else if (general) {
      const p = condProb(general[1], attacker, target, ctx);
      if (p === null) note(eff.slice(0, 90));
      else { const add = p >= 0.75 ? +general[2] : p <= 0.25 ? 0 : Math.round(+general[2] * p / 10) * 10; dmg += add; if (add) notes.push(`+${add} se ${general[1].slice(0, 50)}${p < 0.75 ? ` (~${Math.round(p * 100)}%)` : ''}`); }
    } else {
      note(eff.slice(0, 90));
    }
  } else if (!n && /choose 1 of your opponent.s active pok[eé]mon.s attacks and use it as this attack/i.test(eff)) {
    // Copia um ataque do Pokémon Ativo dele (Foul Play): usa o maior dano dele contra ele mesmo
    const own = (target.attacks ?? []).filter((a) => !/use it as this attack/i.test(a.effect ?? ''));
    const best = own.map((a) => damageVs(a, attacker, target, { ...ctx, bonus: 0 })).sort((x, y) => y.dmg - x.dmg)[0];
    if (!best?.dmg) return { dmg: 0, notes };
    return { dmg: best.dmg, notes: [...best.notes, 'copia o ataque dele'] };
  } else if (!n) {
    // Sem número no dano: o efeito diz onde o dano vai
    const counters = eff.match(/put (\d+) damage counters on (?:your opponent.s active pok[eé]mon|the defending pok[eé]mon|1 of your opponent.s pok[eé]mon)/i);
    if (counters) {
      // Contadores não são dano: sem fraqueza, resistência nem redução
      return { dmg: +counters[1] * 10, notes: ['contadores (sem fraqueza/redução)'], counters: true };
    }
    const to = eff.match(/does (\d+) damage to (the new active pok[eé]mon|each of your opponent.s pok[eé]mon|1 of your opponent.s pok[eé]mon|your opponent.s active pok[eé]mon)/i);
    dmg = to ? +to[1] : 0; // "1 of your opponent's Benched" não atinge o Ativo
    if (to && /new active/i.test(to[2])) notes.push('puxa do banco e bate');
  } else {
    dmg = n;
  }
  if (!dmg) return { dmg: 0, notes };
  // Bônus aplicado ANTES de fraqueza/resistência (ex.: Binding Mochi "+40 before applying Weakness")
  if (ctx.bonus) { dmg += ctx.bonus; if (ctx.bonusNote) notes.push(ctx.bonusNote); }

  // "isn't affected by Weakness" (só fraqueza), "…by Resistance", "…by Weakness or Resistance" (as duas)
  const ignoresW = /isn.t affected by weakness/i.test(eff);
  const ignoresR = /isn.t affected by (weakness or )?resistance/i.test(eff);
  // Fraqueza alterada por efeito em jogo (ex.: Lillie's Clefairy ex: Pokémon {N} do oponente ficam fracos a {P})
  let weaknesses = target.weaknesses ?? [];
  const wo = ctx.weaknessOverride;
  if (wo && (target.types ?? []).includes(wo.fromType)) { weaknesses = [{ type: wo.toType }]; }
  if (!ignoresW && weaknesses.some((w) => (attacker.types ?? []).includes(w.type))) { dmg *= 2; notes.push(wo && (target.types ?? []).includes(wo.fromType) ? `fraqueza (${wo.by})` : 'fraqueza'); }
  if (!ignoresR && (target.resistances ?? []).some((r) => (attacker.types ?? []).includes(r.type))) dmg -= 30;
  // Redução de dano do defensor (habilidade "recebe N a menos de dano", depois de fraqueza)
  if (ctx.reduction && !/isn.t affected by .*effects/i.test(eff)) { dmg -= ctx.reduction; notes.push(`−${ctx.reduction} (redução)`); }
  return { dmg: Math.max(0, dmg), notes };
}

// Maior dano de um Pokémon contra um alvo (entre os ataques que ele consegue pagar)
export function bestDamageVs(attacker, target, ctx = {}, canPay = () => true) {
  let best = { dmg: 0, attack: null, notes: [] };
  for (const a of attacker.attacks ?? []) {
    if (!canPay(a)) continue;
    const r = damageVs(a, attacker, target, ctx);
    if (r.dmg > best.dmg) best = { ...r, attack: a };
  }
  return best;
}
