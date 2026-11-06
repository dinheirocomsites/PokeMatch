// Função ÚNICA de dano: usada pelo motor, pelo simulador de prêmios e pela análise de risco.
// Lê as condições do texto do ataque e calcula o dano CONTRA UM ALVO ESPECÍFICO.
// Quando não entende uma condição, não chuta: conta o bônus como 0 e registra em `unparsed`.
import { parseSelector, matches, attackDamage } from './tags.js';

export const unparsed = new Map(); // texto da condição -> nº de vezes (relatório de qualidade)
const note = (k) => unparsed.set(k, (unparsed.get(k) ?? 0) + 1);

// Quantas vezes um "for each" costuma contar, no contexto do deck que ataca
export function multiplier(effect, deck, defenderBench = 5, ctx = {}) {
  const maxInPlay = deck?.bigBench ? 9 : 6;
  const e = effect;
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
    else dmg = n * multiplier(eff, ctx.deck, ctx.defenderBench, ctx);
  } else if (d.endsWith('+')) {
    dmg = n;
    const cond = eff.match(/if (?:your opponent.s active pok[eé]mon|the defending pok[eé]mon) (?:already )?(is|has) ([^,]+?), this attack does (\d+) more damage/i);
    const coin = eff.match(/flip a coin\. if heads, this attack does (\d+) more damage/i);
    const afterKO = eff.match(/if any of your pok[eé]mon were knocked out[^,]*during your opponent.s last turn, this attack does (\d+) more damage/i);
    const benchType = eff.match(/if you have any \{([A-Z])\} pok[eé]mon on your bench, this attack does (\d+) more damage/i);
    const behind = eff.match(/if you have more prize cards remaining than your opponent, this attack does (\d+) more damage/i);
    const self = eff.match(/if this pok[eé]mon has any damage counters on it, this attack does (\d+) more damage/i);
    const each = eff.match(/(\d+) more damage for each/i);
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
        if (ok === null) { note(phrase); ok = false; }
      }
      if (ok) { dmg += +more; notes.push(`+${more} (${phrase.replace(/^an? /i, '')})`); }
    } else if (self) {
      if (ctx.selfDamaged) { dmg += +self[1]; notes.push('ferido'); }
    } else if (each) {
      dmg += +each[1] * multiplier(eff, ctx.deck, ctx.defenderBench, ctx);
    } else if (/flip a coin until you get tails/i.test(eff)) {
      dmg += +(eff.match(/(\d+) more damage/i)?.[1] ?? 0);
    } else {
      note(eff.slice(0, 90));
    }
  } else {
    dmg = attackDamage(attack);
  }
  if (!dmg) return { dmg: 0, notes };
  // Bônus aplicado ANTES de fraqueza/resistência (ex.: Binding Mochi "+40 before applying Weakness")
  if (ctx.bonus) { dmg += ctx.bonus; if (ctx.bonusNote) notes.push(ctx.bonusNote); }

  const ignoresWR = /isn.t affected by weakness/i.test(eff);
  if (!ignoresWR && (target.weaknesses ?? []).some((w) => (attacker.types ?? []).includes(w.type))) { dmg *= 2; notes.push('fraqueza'); }
  if (!ignoresWR && (target.resistances ?? []).some((r) => (attacker.types ?? []).includes(r.type))) dmg -= 30;
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
