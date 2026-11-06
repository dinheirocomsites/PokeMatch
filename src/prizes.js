// Simulador de corrida de prêmios.
// Modelo simplificado, turno a turno: você ataca com um Pokémon e nocauteia o
// melhor alvo que consegue; o oponente responde nocauteando o seu atacante.
// O dano depende do estado (prêmios já pegos, Pokémon ferido, envenenado…).
import { attackDamage, extractTags, matches } from './tags.js';
import { potentialDamage } from './fit.js';
import { damageVs } from './damage.js';

const SYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M' };
const canPay = (cost, types) => (cost ?? []).every((t) => t === 'Colorless' || types.has(t));

// O que o meu deck consegue fazer em volta do atacante
function myEngine(me) {
  const texts = me.entries.map((e) => e.card);
  const selfDamage = texts.some((c) => /place \d+ damage counters on that pok[eé]mon|also does \d+ damage to itself|damage to 1 of your benched/i.test(c.text));
  const selfDmgAmount = Math.max(10, ...texts.map((c) => +(c.text.match(/place (\d+) damage counters on that pok[eé]mon/i)?.[1] ?? 0) * 10));
  let poisonSwitch = null; // { sym, except: [] , by }
  let poisonBoost = 0;
  let passive = 0;
  let passiveBy = null;
  for (const c of texts) {
    const m = c.text.match(/switch 1 of your benched \{([A-Z])\} pok[eé]mon(?:, except any ([^,]+),)?[^.]*with your active pok[eé]mon\. if you do, the new active pok[eé]mon is now poisoned/i);
    if (m) poisonSwitch = { sym: m[1], except: m[2] ? [m[2].trim()] : [], by: c.name };
    const b = c.text.match(/attacks used by the poisoned pok[eé]mon this card is attached to do (\d+) more damage/i);
    if (b) poisonBoost = Math.max(poisonBoost, +b[1]);
    const p = c.text.match(/move up to (\d+) damage counters from 1 of your pok[eé]mon to 1 of your opponent/i);
    if (p) { const needs = c.text.match(/has any \{([A-Z])\} energy attached/i); if (!needs || [...me.energyTypes].some((t) => SYM[t] === needs[1])) { passive = Math.max(passive, +p[1] * 10); passiveBy = c.name; } }
  }
  // Aceleração de energia por turno (ex.: Toxtricity "Sinister Surge" liga 1 energia do deck)
  const accel = texts.some((c) => (c.abilities ?? []).some((a) => /search your deck for a basic \{?[a-z]*\}? ?energy card and attach it|attach (a|up to \d+) basic .*energy/i.test(a.effect ?? '')));
  return { selfDamage, selfDmgAmount, poisonSwitch, poisonBoost, passive, passiveBy, accel };
}

// Dano do meu ataque num alvo, dado o estado do jogo
function myDamage(card, attack, target, state, me, eng, extra = {}) {
  const ps = eng.poisonSwitch;
  const poisoned = ps && eng.poisonBoost && (card.types ?? []).some((t) => SYM[t] === ps.sym) && !ps.except.includes(card.name);
  const r = damageVs(attack, card, target, {
    deck: me, oppTaken: state.oppTaken, selfDamaged: eng.selfDamage, ...(me.pressure ?? {}),
    bonus: poisoned ? eng.poisonBoost : 0, bonusNote: poisoned ? `+${eng.poisonBoost} envenenado` : '', ...extra,
  });
  r.poisoned = !!poisoned;
  if (!r.dmg) return r;
  if (eng.passive) { r.dmg += eng.passive; r.notes.push(`+${eng.passive} ${eng.passiveBy}`); }
  return r;
}

// Dano no Pokémon Checkup (entre os turnos) no Ativo que o ataque deixou Envenenado/Queimado.
// Conta só efeito garantido (sem moeda) e os extras do deck de quem atacou (Pecharunt: +50 se ele estiver Ativo;
// Magmortar: +30 em Queimado; Perilous Jungle: +20 em Envenenado não-{D}).
export function checkupDamage(attack, attacker, target, deck) {
  const eff = attack?.effect ?? '';
  const coin = /flip a coin/i.test(eff);
  // habilidade do seu deck que queima/envenena o Ativo dele todo turno (Volcarona: "make your opponent's Active Pokémon Burned")
  const byAbility = (cond) => (deck?.entries ?? []).some((e) => (e.card.abilities ?? []).some((a) => new RegExp(`make your opponent.s active pok[eé]mon ${cond}`, 'i').test(a.effect ?? '') && !/flip a coin/i.test(a.effect ?? '') && (!/if this pok[eé]mon is in the active spot/i.test(a.effect ?? '') || e.card.name === attacker?.name)));
  const poison = (!coin && /(defending|opponent.s active) pok[eé]mon is now (?:[a-z]+ and )?poisoned/i.test(eff)) || byAbility('poisoned');
  const burn = (!coin && /(defending|opponent.s active) pok[eé]mon is now (?:[a-z]+ and )?burned/i.test(eff)) || byAbility('burned');
  if (!poison && !burn) return { dmg: 0 };
  let dmg = 0;
  const why = [];
  const instead = eff.match(/put (\d+) damage counters (?:on that pok[eé]mon )?instead of \d+/i);
  if (poison) {
    dmg += instead && !burn ? +instead[1] * 10 : 10; why.push(instead && !burn ? `veneno forte (${+instead[1] * 10})` : 'veneno');
    for (const e of deck?.entries ?? []) for (const a of [...(e.card.abilities ?? []), { effect: e.card.trainerType === 'Stadium' ? e.card.text : '' }]) {
      const m = (a.effect ?? '').match(/put (\d+) more damage counters on (?:your opponent.s|each) poisoned (non-\{([A-Z])\} )?pok[eé]mon during pok[eé]mon checkup|during pok[eé]mon checkup, put (\d+) more damage counters on each poisoned (non-\{([A-Z])\} )?pok[eé]mon/i);
      if (!m) continue;
      const n = +(m[1] ?? m[4]);
      const notSym = m[3] ?? m[6];
      if (/as long as this pok[eé]mon is in the active spot/i.test(a.effect) && e.card.name !== attacker.name) continue;
      if (notSym && (target.types ?? []).some((t) => SYM[t] === notSym)) continue;
      dmg += n * 10; why.push(`+${n * 10} ${e.card.name}`);
    }
  }
  if (burn) {
    dmg += 20; why.push('queimadura');
    for (const e of deck?.entries ?? []) for (const a of e.card.abilities ?? []) {
      const m = (a.effect ?? '').match(/put (\d+) more damage counters on your opponent.s burned pok[eé]mon/i);
      if (m) { dmg += +m[1] * 10; why.push(`+${+m[1] * 10} ${e.card.name}`); }
    }
  }
  return { dmg, why: why.join(' ') };
}

// Quantos "Boss" um deck tem de verdade: Supporter/Item que puxa (moeda = meio), habilidade ao evoluir;
// ataque que puxa não conta (o Pokémon precisa estar atacando). Lisia's só puxa Básico (meio).
export function gustBudget(deck) {
  let n = 0;
  for (const e of deck.entries) {
    const t = e.card.text ?? '';
    if (!/switch in 1 of your opponent.s benched/i.test(t)) continue;
    if (e.card.category === 'Trainer') {
      if (/team rocket.s pok[eé]mon/i.test(t) && !deck.entries.some((x) => x.card.owner === 'Team Rocket')) continue;
      n += e.count * (/flip a coin/i.test(t) || /benched basic pok[eé]mon/i.test(t) ? 0.5 : 1);
    } else if ((e.card.abilities ?? []).some((a) => /switch in 1 of your opponent.s benched/i.test(a.effect ?? '') && !/flip a coin/i.test(a.effect ?? ''))) n += e.count;
  }
  return Math.min(3, Math.ceil(n / 2)); // nem todos aparecem a tempo
}

// Maior dano do oponente num Pokémon meu
function oppBest(target, opp, oppLeft) {
  let best = { dmg: 0, by: null };
  for (const e of opp.threat) {
    if (!oppLeft.get(e.card.name) || e.feas < 0.3) continue;
    for (const a of e.card.attacks ?? []) {
      const r = damageVs(a, e.card, target, { deck: opp, oppTaken: 3 });
      if (r.dmg > best.dmg) best = { dmg: r.dmg, by: e.card.name, weak: r.notes.includes('fraqueza') };
    }
  }
  return best;
}

// O oponente escolhe com quem atacar: quem nocauteia o seu atacante entregando
// MENOS prêmios (e, no empate, com mais HP). Se ninguém nocauteia, usa o que mais bate.
const wallCache = new Map();
function wallsOf(card) {
  if (!wallCache.has(card.id)) wallCache.set(card.id, extractTags(card).filter((t) => t.kind === 'WALL_SELF' && t.source === 'ability'));
  return wallCache.get(card.id);
}
// Muralha criada pelo ataque usado neste turno (ex.: Golbat "Covert Flight": no próximo turno, Básicos não causam dano)
const atkWallCache = new Map();
function attackWalls(card, attackName) {
  const k = `${card.id}|${attackName}`;
  if (!atkWallCache.has(k)) atkWallCache.set(k, extractTags(card).filter((t) => t.kind === 'WALL_SELF' && t.source === 'attack' && t.name === attackName && !(t.cond ?? []).includes('coin')));
  return atkWallCache.get(k);
}
// ---------- Efeitos que mudam a corrida, lidos do texto das cartas ----------
const SYMX = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless' };
// Dano espalhado no banco
function spreadOf(attack) {
  const e = attack?.effect ?? '';
  let m = e.match(/put (\d+) damage counters on your opponent.s benched pok[eé]mon in any way/i);
  if (m) return { mode: 'distribute', amount: +m[1] * 10 };
  m = e.match(/put (\d+) damage counters? on each of your opponent.s benched/i);
  if (m) return { mode: 'each', amount: +m[1] * 10 };
  m = e.match(/(\d+) damage to each of your opponent.s benched/i);
  if (m) return { mode: 'each', amount: +m[1] };
  m = e.match(/(\d+) damage to (1|2) of your opponent.s benched pok[eé]mon/i);
  if (m) return { mode: 'single', amount: +m[1], count: +m[2] };
  return null;
}
// Desvantagem do próprio ataque
export function drawbackOf(attack) {
  const e = attack?.effect ?? '';
  const name = (attack?.name ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    noAttack: /during your next turn, this pok[eé]mon can.t (attack|use attacks)/i.test(e) || (!!name && new RegExp(`during your next turn, this pok[eé]mon can.t use ${name}`, 'i').test(e)),
    discardEnergy: (/discard (all|\d+|an?) (basic )?(\{[A-Z]\} )?energy from this pok[eé]mon/i.test(e) || /put (an|\d+) (\{[A-Z]\} )?energy attached to this pok[eé]mon into your hand/i.test(e)) && !/you may (discard|put|shuffle)/i.test(e),
    takesMore: +(e.match(/this pok[eé]mon takes (\d+) more damage/i)?.[1] ?? 0),
    // Proteção do próprio ataque no turno dele (sem moeda): "takes 30 less damage" / "prevent all damage done to this Pokémon"
    shield: /flip a coin/i.test(e) ? 0 : /during your opponent.s next turn, prevent all damage (?:from and effects of attacks )?done to this pok[eé]mon/i.test(e) ? 999 : +(e.match(/during your opponent.s next turn, (?:this pok[eé]mon takes|attacks used by the defending pok[eé]mon do) (\d+) less damage/i)?.[1] ?? 0),
    // Trava o Pokémon que recebeu o ataque: no turno dele, ele não ataca (tem que trocar)
    // (também: "no fim do próximo turno dele, o Defensor é nocauteado/descartado/leva 9 contadores" — ele precisa trocar)
    lockDefender: !/flip a coin/i.test(e) && (/during your opponent.s next turn, the defending pok[eé]mon can.t (attack|use attacks)/i.test(e) || /during your opponent.s next turn, that pok[eé]mon can.t use that attack/i.test(e) || /at the end of your opponent.s next turn, (the defending pok[eé]mon will be knocked out|discard the defending pok[eé]mon|put \d+ damage counters on the defending)/i.test(e)),
    // Retaliação só no turno dele ("during your opponent's next turn, if this Pokémon is damaged by an attack, put 8 damage counters on the Attacking Pokémon")
    retaliate: /flip a coin/i.test(e) ? 0 : +(e.match(/during your opponent.s next turn, if this pok[eé]mon is damaged by an attack[^,]*,\s*(?:put|place) (\d+) damage counters on the attacking/i)?.[1] ?? 0) * 10,
  };
}
// Ataque que puxa do banco dele e bate no novo Ativo (Dipplin, Malamar…): nocauteia no banco sem gastar Boss
const pullsIn = (a) => /switch in 1 of your opponent.s benched pok[eé]mon to the active spot/i.test(a?.effect ?? '');
// Redução de dano do defensor (habilidade)
const tagCache = new Map();
const tagsOf = (c) => { if (!tagCache.has(c.id ?? c.name)) tagCache.set(c.id ?? c.name, extractTags(c)); return tagCache.get(c.id ?? c.name); };
function reductionOn(defender, attacker) {
  let r = 0;
  for (const t of tagsOf(defender)) if (t.kind === 'REDUCE' && t.source === 'ability' && !(t.cond ?? []).length && (!t.sel || !Object.keys(t.sel).length || matches(t.sel, attacker))) r = Math.max(r, t.amount);
  return r;
}
const copiesAttacks = (card) => (card.abilities ?? []).some((a) => /can use the attacks of any of your benched pok[eé]mon/i.test(a.effect ?? ''));
function weaknessOverrideFrom(deck) {
  for (const e of deck.entries) for (const a of e.card.abilities ?? []) {
    const m = (a.effect ?? '').match(/weakness of each of your opponent.s \{([A-Z])\} pok[eé]mon in play is now \{([A-Z])\}/i);
    if (m) return { fromType: SYMX[m[1]], toType: SYMX[m[2]], by: e.card.name };
  }
  return null;
}
function hpToolOf(deck) {
  for (const e of deck.entries) {
    const m = e.card.trainerType === 'Tool' && e.card.text.match(/gets \+(\d+) hp/i);
    const only = e.card.text.match(/the (.+?) this card is attached to/i)?.[1];
    if (m && (!only || /^pok[eé]mon$/i.test(only))) return { amount: +m[1], name: e.card.name };
  }
  return null;
}
// Disrupção que o oponente faz na corrida
function oppDisruption(opp) {
  const hammers = opp.entries.filter((e) => /discard an energy from (1 of )?your opponent/i.test(e.card.text));
  const hammerBudget = Math.min(3, Math.round(hammers.reduce((s2, e) => s2 + e.count * (/flip a coin/i.test(e.card.text) ? 0.5 : 1), 0) * 0.7));
  const stamps = opp.entries.filter((e) => /only if any of your pok[eé]mon were knocked out during your opponent.s last turn/i.test(e.card.text) && /shuffles? (their|your) hand/i.test(e.card.text));
  const earlyLock = opp.entries.some((e) => e.card.category === 'Pokemon' && e.card.stage === 'Basic' && (e.card.attacks ?? []).some((a) => (a.cost ?? []).length <= 1 && /can.t play any item cards/i.test(a.effect ?? '')));
  const ruins = opp.entries.find((e) => e.card.trainerType === 'Stadium' && e.count >= 2 && /basic non-\{([A-Z])\} pok[eé]mon onto their bench[^.]*place (\d+) damage counters/i.test(e.card.text));
  const ruinsM = ruins?.card.text.match(/basic non-\{([A-Z])\} pok[eé]mon onto their bench[^.]*place (\d+) damage counters/i);
  return {
    hammerBudget, hammerName: hammers[0]?.card.name,
    stampLeft: stamps.reduce((s2, e) => s2 + e.count, 0) ? 1 : 0, stampName: stamps[0]?.card.name,
    earlyLock, ruins: ruinsM ? { notType: SYMX[ruinsM[1]], dmg: +ruinsM[2] * 10, name: ruins.card.name } : null,
  };
}

// O oponente escolhe com quem atacar: quem nocauteia o seu atacante entregando MENOS prêmios
// (e, no empate, com mais HP). Se ninguém nocauteia, usa o que mais bate.
function oppChoose(target, opp, oppLeft, hitsTaken, extraWalls = [], ctx = {}) {
  const opts = [];
  const walls = [...wallsOf(target), ...extraWalls];
  const hp = target.hp + (ctx.hpBonus ?? 0);
  const pool = opp.threat.filter((e) => oppLeft.get(e.card.name) && e.feas >= 0.3);
  for (const e of pool) {
    if ([].concat(ctx.cooldown ?? []).includes(e.card.name)) continue; // não pode atacar neste turno (desvantagem do ataque anterior / trava do seu ataque)
    // Tempo do oponente: Estágio 2 só fica pronto a partir do 2º turno de resposta (Estágio 1 já no 1º)
    if (ctx.oppTurn && e.card.stage === 'Stage2' && ctx.oppTurn < 2) continue;
    if (walls.some((w) => matches(w.sel, e.card))) continue; // muralha: esse atacante não causa dano
    const atks = copiesAttacks(e.card) ? [...(e.card.attacks ?? []), ...pool.filter((x) => x !== e).flatMap((x) => x.card.attacks ?? [])] : (e.card.attacks ?? []);
    let best = null;
    for (const a of atks) {
      const r = damageVs(a, e.card, target, { deck: opp, oppTaken: 3, weaknessOverride: ctx.wo, reduction: reductionOn(target, e.card) });
      const dmg = Math.max(0, r.dmg + (r.dmg ? (ctx.takesMore ?? 0) : 0) - (r.counters ? 0 : (ctx.shield ?? 0)));
      if (dmg > 0 && (!best || dmg > best.dmg || (dmg + hitsTaken >= hp && best.dmg + hitsTaken >= hp && spreadOf(a) && !spreadOf(best.atk)))) best = { dmg, weak: r.notes.some((n) => n.startsWith('fraqueza')), atk: a };
    }
    if (best) {
      // "Com HP cheio, não é nocauteado: fica com 10 HP" (Pikachu ex, Crustle)
      const sturdy = !hitsTaken && tagsOf(target).some((t) => t.kind === 'SURVIVE_FULL');
      const ko = best.dmg + hitsTaken >= hp && !sturdy;
      opts.push({ card: e.card, ...best, dmg: sturdy && best.dmg >= hp ? hp - 10 : best.dmg, ko, sturdy: sturdy && best.dmg >= hp });
    }
  }
  const kos = opts.filter((o) => o.ko).sort((a, b) => a.card.prizeValue - b.card.prizeValue || (spreadOf(b.atk) ? 1 : 0) - (spreadOf(a.atk) ? 1 : 0) || b.card.hp - a.card.hp);
  if (kos.length) return kos[0];
  return opts.sort((a, b) => b.dmg - a.dmg)[0] ?? null;
}

// Aplica dano espalhado no seu banco; devolve os nocautes
function applySpread(spread, benchCards, benchDmg, lost) {
  const kos = [];
  const alive = benchCards.filter((b) => !lost.includes(b.name));
  const rem = (b) => b.hp - (benchDmg[b.name] ?? 0);
  if (!spread || !alive.length) return kos;
  if (spread.mode === 'each') {
    for (const b of alive) { benchDmg[b.name] = (benchDmg[b.name] ?? 0) + spread.amount; if (rem(b) <= 0) kos.push(b); }
  } else if (spread.mode === 'distribute') {
    let left = spread.amount;
    const order = [...alive].sort((a, b) => b.prizeValue - a.prizeValue || rem(a) - rem(b));
    for (const b of order) if (rem(b) <= left) { left -= Math.max(0, rem(b)); benchDmg[b.name] = b.hp; kos.push(b); }
    if (left > 0) { const t = alive.filter((b) => !kos.includes(b)).sort((a, b) => rem(a) - rem(b))[0]; if (t) benchDmg[t.name] = (benchDmg[t.name] ?? 0) + left; }
  } else {
    for (let i = 0; i < (spread.count ?? 1); i++) {
      const cand = alive.filter((b) => !kos.includes(b));
      const killable = cand.filter((b) => rem(b) <= spread.amount).sort((a, b) => b.prizeValue - a.prizeValue)[0];
      const t = killable ?? cand.sort((a, b) => b.prizeValue - a.prizeValue || rem(a) - rem(b))[0];
      if (!t) break;
      benchDmg[t.name] = (benchDmg[t.name] ?? 0) + spread.amount;
      if (rem(t) <= 0) kos.push(t);
    }
  }
  return kos;
}

export function simulateRace(me, opp, { extraAttackers = [], denial = null, energyTypes = null, maxTurns = 9, only = null } = {}) {
  const meX = energyTypes ? { ...me, energyTypes } : me;
  const eng = myEngine(meX);
  const attackers = [];
  for (const e of [...me.entries, ...extraAttackers]) {
    if (e.card.category !== 'Pokemon') continue;
    const atks = (e.card.attacks ?? []).filter((a) => canPay(a.cost, meX.energyTypes) && (attackDamage(a) || /for each prize/i.test(a.effect ?? '')));
    if (atks.length) attackers.push({ card: e.card, count: e.count, atks });
  }
  if (only) attackers.splice(0, attackers.length, ...attackers.filter((a) => only.includes(a.card.name)));
  const pool = attackers.sort((a, b) => Math.max(...b.atks.map((x) => attackDamage(x) || 120)) - Math.max(...a.atks.map((x) => attackDamage(x) || 120))).slice(0, 5);
  for (const x of extraAttackers) if (!pool.some((p) => p.card.name === x.card.name)) { const a = attackers.find((p) => p.card.name === x.card.name); if (a) pool.push(a); }
  const targets = opp.entries.filter((e) => e.card.category === 'Pokemon').map((e) => e.card);
  const gusts = gustBudget(me);
  const oppLeft0 = new Map(targets.map((t) => [t.name, opp.entries.find((e) => e.card.name === t.name).count]));
  // O oponente abre com quem mata o seu atacante principal entregando menos prêmios
  // Quem está no Ativo dele no seu 1º ataque: um Básico que trava Itens com ataque barato (ex.: Budew),
  // se ele tiver; senão quem mata o seu atacante principal entre os que já estão prontos (Básico/Estágio 1)
  const lockOpener = opp.entries.find((e) => e.card.category === 'Pokemon' && e.card.stage === 'Basic' && (e.card.attacks ?? []).some((a) => (a.cost ?? []).length <= 1 && /can.t play any item cards/i.test(a.effect ?? '')))?.card.name;
  const opener = lockOpener ?? (me.mainAttacker && oppChoose(me.mainAttacker, opp, oppLeft0, 0, [], { oppTurn: 1 })?.card.name)
    ?? [...opp.threat].filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).length && e.card.stage !== 'Stage2').sort((a, b) => b.threat - a.threat)[0]?.card.name
    ?? opp.entries.find((e) => e.card.category === 'Pokemon' && e.card.stage === 'Basic')?.card.name ?? opp.entries.find((e) => e.card.category === 'Pokemon')?.card.name;
  // No banco dele (alcançável com Boss): Pokémon com habilidade que funciona no banco + os que já atacaram
  const benchy = new Set(targets.filter((t) => (t.abilities ?? []).some((a) => !/in the active spot/i.test(a.effect ?? ''))).map((t) => t.name));

  // O oponente também usa Boss's Orders para contornar muralhas
  const oppGusts0 = gustBudget(opp);
  // Seu banco: peças do plano + a reserva do atacante principal (alvos de Boss e de dano espalhado)
  const benchNames = [...new Set([...(me.board?.pieces ?? []), me.board?.backup].filter(Boolean))];
  const myBench = benchNames.map((n) => me.entries.find((e) => e.card.name === n)?.card).filter((c) => c?.category === 'Pokemon');
  // Efeitos de cartas que mudam a corrida
  const dis = oppDisruption(opp);
  const oppWO = weaknessOverrideFrom(opp); // fraqueza alterada pelo oponente contra os seus Pokémon
  const myWO = weaknessOverrideFrom(meX);
  const oppCape = hpToolOf(opp);
  const capeOn = oppCape ? [...targets].filter((t) => opp.threat.find((x) => x.card.name === t.name)?.feas >= 0.3).sort((a, b) => b.prizeValue - a.prizeValue || (opp.threat.find((x) => x.card.name === b.name)?.threat ?? 0) - (opp.threat.find((x) => x.card.name === a.name)?.threat ?? 0))[0]?.name : null;
  const myCape = hpToolOf(meX);
  const benchDmg0 = {};
  if (dis.ruins) for (const b of myBench) if (b.stage === 'Basic' && !(b.types ?? []).includes(dis.ruins.notType)) benchDmg0[b.name] = dis.ruins.dmg;
  const income = 1 + (eng.accel ? 1 : 0); // energia por turno: 1 manual + aceleração
  const SETUP_BANK = dis.earlyLock ? 2 : 3; // trava de Itens no 1º turno = setup menor
  const killsMain = new Set(me.mainAttacker ? opp.threat.filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).some((a) => damageVs(a, e.card, me.mainAttacker, { deck: opp, oppTaken: 3, weaknessOverride: oppWO }).dmg >= me.mainAttacker.hp - 20)).map((e) => e.card.name) : []);
  const effHp = (t, st) => t.hp + (oppCape && st.capeLeft && t.name === capeOn ? oppCape.amount : 0) - (st.oppDmg?.[t.name] ?? 0);
  // Tempo de evolução: se o seu atacante é Estágio 1/2, ele só ataca no seu 2º turno → o oponente ataca antes,
  // no Básico que vai evoluir (o dano fica no Pokémon depois de evoluir). Atacante Básico: supõe que você vai 2º.
  const basicOf = (c) => { let x = c; for (let i = 0; i < 2 && x?.evolveFrom; i++) x = me.entries.find((e) => e.card.name === x.evolveFrom)?.card ?? null; return x && x !== c && x.stage === 'Basic' ? x : null; };
  const preCache = new Map();
  const preAttack = (att, openerName) => {
    if (!att.card.stage || att.card.stage === 'Basic') return null;
    const k = `${att.card.name}|${openerName}`;
    if (preCache.has(k)) return preCache.get(k);
    const starter = basicOf(att.card);
    const op = opp.entries.find((e) => e.card.name === openerName)?.card;
    let res = null;
    if (starter && op && op.stage !== 'Stage2') {
      let b = null;
      for (const a of op.attacks ?? []) {
        if ((a.cost ?? []).length > 2) continue; // 1º/2º turno dele: no máximo 2 energias
        const r = damageVs(a, op, starter, { deck: opp, oppTaken: 0, weaknessOverride: oppWO });
        if (!b || r.dmg > b.dmg) b = { dmg: r.dmg, atk: a.name };
      }
      res = { by: op.name, atk: b?.atk, target: starter.name, dmg: Math.round(b?.dmg ?? 0), ko: (b?.dmg ?? 0) >= starter.hp, prizes: starter.prizeValue, copies: me.entries.find((e) => e.card.name === starter.name)?.count ?? 1 };
    }
    preCache.set(k, res);
    return res;
  };
  let best = null;
  const finals = [];
  const memo = new Map();
  function rec(stateIn, steps, depth, parentKey = null) {
    let state = stateIn;
    const key = `${JSON.stringify(state.oppDmg)}|${state.tempo}|${JSON.stringify(state.benchDmg)}|${state.oppCooldown}|${state.capeLeft}|${state.myCapeLeft}|${state.hammer}|${state.stampLeft}|${state.stamped}|${state.active?.cool}|${state.active?.needEnergy}|${state.oppGusts}|${(state.benchLost ?? []).join(',')}|${state.bank}|${state.gustsUsed}|${state.energySpent}|${state.myTaken}|${state.oppTaken}|${state.active?.card.name}|${state.active?.dmgTaken}|${[...state.shown].sort()}|${state.oppActive}|${state.gusts}|${[...state.myLeft.values()]}|${[...state.oppLeft.values()]}|${state.denialLeft}`;
    // Fim de jogo vem antes da poda: um estado igual ao anterior (ex.: ele ficou sem Pokémon) ainda precisa fechar o jogo
    const oppOut = ![...state.oppLeft.values()].some((n) => n > 0); // ele não tem mais Pokémon em jogo: você vence
    if (oppOut && state.myTaken < 6) state = { ...state, myTaken: 6, wipeout: true };
    // Nada mudou desde o turno anterior (ninguém consegue avançar): fecha o jogo como está
    const stalled = key === parentKey;
    if (!(state.myTaken >= 6 || state.oppTaken >= 6 || depth >= maxTurns || stalled)) {
      if (memo.has(key) && memo.get(key) <= depth) return;
      memo.set(key, depth);
    }
    if (state.myTaken >= 6 || state.oppTaken >= 6 || depth >= maxTurns || stalled) {
      // Vence quem fecha primeiro; entre vitórias, prefere margem MAS cobra recursos (Boss e energia)
      const cost = state.gustsUsed * 4 + state.energySpent * 1.5;
      const score = state.myTaken >= 6 ? 1000 - depth * 20 + (6 - state.oppTaken) * 5 - cost : state.oppTaken >= 6 ? state.myTaken * 10 - 500 - cost : state.myTaken * 10 - state.oppTaken * 10 - 100 - cost;
      const res = { score, steps, win: state.myTaken >= 6, myTaken: state.myTaken, oppTaken: state.oppTaken, turns: depth, gustsUsed: state.gustsUsed, energySpent: state.energySpent };
      finals.push(res);
      if (!best || score > best.score) best = res;
      return;
    }
    const choices = state.active ? [state.active.att, ...pool.filter((p) => p !== state.active.att)] : pool;
    for (const att of choices) {
      if (!state.myLeft.get(att.card.name)) continue;
      if (state.benchLost?.includes(att.card.name) && state.myLeft.get(att.card.name) <= 1 && state.active?.att !== att) continue; // nocauteado no banco
      // Desvantagem do ataque anterior: este atacante não pode atacar agora → precisa trocar
      if (state.active?.att === att && state.active.cool) continue;
      const continuing = state.active?.att === att;
      const reEnergize = continuing ? (state.active.needEnergy ?? 0) : 0;
      const options = [];
      const payable = (a) => (continuing ? reEnergize <= state.bank : (a.cost ?? []).length <= state.bank);
      const ko = (t) => {
        let r = null;
        for (const a of att.atks) {
          if (!payable(a)) continue;
          const x = myDamage(att.card, a, t, state, meX, eng, { weaknessOverride: myWO, reduction: reductionOn(t, att.card) });
          const chk = x.dmg ? checkupDamage(a, att.card, t, meX) : { dmg: 0 };
          const sturdy = !(state.oppDmg?.[t.name]) && tagsOf(t).some((tg) => tg.kind === 'SURVIVE_FULL');
          if (x.dmg && !sturdy && x.dmg + chk.dmg >= effHp(t, state) && (!r || (a.cost ?? []).length < (r.a.cost ?? []).length || x.dmg > r.r.dmg)) r = { a, r: x, chk: x.dmg >= effHp(t, state) ? null : chk };
        }
        return r;
      };
      // Sem nocaute: o melhor dano no Ativo dele fica acumulado (nocaute em 2 ataques)
      const chip = (t) => {
        let r = null;
        for (const a of att.atks) {
          if (!payable(a)) continue;
          const x = myDamage(att.card, a, t, state, meX, eng, { weaknessOverride: myWO, reduction: reductionOn(t, att.card) });
          const chk = x.dmg ? checkupDamage(a, att.card, t, meX) : { dmg: 0 };
          if (x.dmg + chk.dmg > 0 && (!r || x.dmg + chk.dmg > r.r.dmg + (r.chk?.dmg ?? 0))) r = { a, r: x, chk };
        }
        // alvo que aguenta com HP cheio fica com 10
        if (r && !(state.oppDmg?.[t.name]) && tagsOf(t).some((tg) => tg.kind === 'SURVIVE_FULL') && r.r.dmg + (r.chk?.dmg ?? 0) >= effHp(t, state)) r = { ...r, r: { ...r.r, dmg: effHp(t, state) - 10 }, chk: null, sturdy: true };
        return r;
      };
      if (!att.atks.some(payable)) continue;
      const act = targets.find((t) => t.name === state.oppActive && state.oppLeft.get(t.name));
      const kAct = act && ko(act);
      if (kAct) options.push({ t: act, ...kAct, gust: false });
      // Ataque que puxa: escolhe um Pokémon do banco dele e bate nele, sem Boss
      if (att.atks.some((a) => pullsIn(a) && payable(a))) {
        let g = null;
        for (const t of targets) {
          if (!state.oppLeft.get(t.name) || t.name === state.oppActive || !(benchy.has(t.name) || state.shown.has(t.name))) continue;
          for (const a of att.atks.filter((x) => pullsIn(x) && payable(x))) {
            const x = myDamage(att.card, a, t, state, meX, eng, { weaknessOverride: myWO, reduction: reductionOn(t, att.card) });
            if (x.dmg >= effHp(t, state) && (!g || t.prizeValue > g.t.prizeValue)) g = { t, a, r: x, gust: false, pulled: true };
          }
        }
        if (g && (!kAct || g.t.prizeValue > act.prizeValue)) options.push(g);
      }
      if (state.gusts > 0 && !state.stamped) { // depois do Unfair Stamp, sem Boss na mão
        let g = null;
        const alts = [];
        for (const t of targets) {
          if (!state.oppLeft.get(t.name) || t.name === state.oppActive || !(benchy.has(t.name) || state.shown.has(t.name))) continue;
          const k = ko(t);
          const rank = (x) => x.t.prizeValue * 10 + (killsMain.has(x.t.name) ? 1 : 0);
          if (k && (!g || rank({ t }) > rank(g))) g = { t, ...k, gust: true };
          if (k) alts.push(t);
        }
        if (g) g.alts = [...new Set(alts.filter((t) => t.prizeValue === g.t.prizeValue).map((t) => t.name))];
        if (g && (!kAct || g.t.prizeValue > act.prizeValue)) options.push(g);
      }
      if (!options.length) { const c = act && chip(act); options.push(c ? { t: act, ...c, gust: false, chip: true } : null); }
      for (const pick of options) {
        const myLeft = new Map(state.myLeft);
        const oppLeft = new Map(state.oppLeft);
        let myTaken = state.myTaken;
        let gustsLeft = state.gusts;
        let capeLeft = state.capeLeft;
        const step = { attacker: att.card.name, prizeValue: att.card.prizeValue, vsActive: state.oppActive, activeValue: targets.find((t) => t.name === state.oppActive)?.prizeValue, stamped: state.stamped };
        const oppDmg = { ...(state.oppDmg ?? {}) };
        // 1º ataque com atacante evoluído: o oponente já atacou o Básico antes (ele ganha tempo)
        let tempo = state.tempo ?? 0;
        let preTaken = 0, preCarry = 0;
        if (depth === 0 && !state.active) {
          const pre = preAttack(att, state.oppActive);
          if (pre) {
            tempo = 1;
            if (pre.dmg > 0) step.pre = pre; // sem dano: só o tempo dele conta (Estágio 2 pronto antes)
            if (pre.ko) preTaken = pre.prizes; // nocauteia o Básico (você evolui outra cópia)
            else preCarry = pre.dmg; // o dano fica no Pokémon depois de evoluir
          }
        }
        const used = pick?.a ?? att.atks.filter(payable).sort((a, b) => (a.cost ?? []).length - (b.cost ?? []).length)[0];
        const spend = continuing ? reEnergize : (used?.cost ?? []).length;
        step.newAttacker = !continuing;
        step.energy = spend;
        step.killsMain = !!pick && !pick.chip && killsMain.has(pick.t.name);
        if (pick?.chip) {
          const add = pick.r.dmg + (pick.chk?.dmg ?? 0);
          oppDmg[pick.t.name] = (oppDmg[pick.t.name] ?? 0) + add;
          Object.assign(step, { attack: pick.a.name, target: null, chip: { target: pick.t.name, dmg: Math.round(pick.r.dmg), checkup: pick.chk?.dmg ? pick.chk : null, left: Math.max(0, Math.round(effHp(pick.t, state) - add)), sturdy: !!pick.sturdy }, prizes: 0, vs: state.oppActive, notes: pick.r.notes });
        } else if (pick) {
          myTaken += pick.t.prizeValue;
          oppLeft.set(pick.t.name, oppLeft.get(pick.t.name) - 1);
          const had = state.oppDmg?.[pick.t.name] ?? 0;
          delete oppDmg[pick.t.name];
          if (pick.gust) gustsLeft--;
          if (pick.t.name === capeOn && capeLeft) { capeLeft = false; step.capeBroken = oppCape.name; }
          Object.assign(step, { alts: pick.alts, attack: pick.a.name, target: pick.t.name, gust: pick.gust, pulled: !!pick.pulled, dmg: Math.round(pick.r.dmg), hp: effHp(pick.t, state), notes: pick.r.notes, prizes: pick.t.prizeValue, had: had ? Math.round(had) : 0, checkup: pick.chk?.dmg ? pick.chk : null });
        } else Object.assign(step, { attack: null, target: null, prizes: 0, vs: state.oppActive });
        step.myTotal = myTaken;
        const bankAfter = state.bank - spend;
        const gustsUsed = state.gustsUsed + (pick?.gust ? 1 : 0);
        const energySpent = state.energySpent + spend;
        if (myTaken >= 6) { rec({ ...state, myTaken, myLeft, oppLeft, oppDmg, tempo, gusts: gustsLeft, gustsUsed, energySpent, bank: bankAfter, capeLeft }, [...steps, step], depth + 1, key); continue; }
        // Desvantagem do MEU ataque (vale no turno do oponente / no meu próximo turno)
        const myDb = drawbackOf(used);
        const selfHurt = pick && eng.selfDamage && /if this pok[eé]mon has any damage counters/i.test(pick.a.effect ?? '') ? eng.selfDmgAmount : 0;
        // Envenenado pelo próprio combo (Pecharunt ex troca e envenena): 10 no Checkup depois do seu turno
        const selfPoison = pick?.r?.poisoned ? 10 : 0;
        const theirRet = pick && !pick.r?.counters ? Math.max(0, ...tagsOf(pick.t).filter((t) => t.kind === 'RETALIATE' && !t.nextTurnOnly && (!t.whenKO || !pick.chip)).map((t) => t.amount)) : 0;
        if (theirRet) step.theirRetaliate = { amount: theirRet, from: pick.t.name };
        const prevHits = (state.active?.att === att ? state.active.dmgTaken : 0) + (state.active?.att === att ? 0 : selfHurt) + preCarry + selfPoison + theirRet;
        const myHpBonus = myCape && state.myCapeLeft && att.card.name === me.mainAttacker?.name ? myCape.amount : 0;
        // Seu ataque trava o Pokémon que sobreviveu a ele ("the Defending Pokémon can't attack"): ele não ataca agora
        const locked = myDb.lockDefender && pick?.chip ? pick.t.name : null;
        if (locked) step.locked = locked;
        const hit = oppChoose(att.card, opp, oppLeft, prevHits, used ? attackWalls(att.card, used.name) : [], { cooldown: [state.oppCooldown, locked].filter(Boolean), wo: oppWO, hpBonus: myHpBonus, takesMore: myDb.takesMore, shield: myDb.shield, oppTurn: depth + 1 + tempo });
        if (myDb.shield) step.shield = myDb.shield;
        let oppTaken = state.oppTaken + preTaken;
        let active = null;
        let denialLeft = state.denialLeft;
        let myCapeLeft = state.myCapeLeft;
        const benchDmg = { ...state.benchDmg };
        let benchLost = [...(state.benchLost ?? [])];
        if (hit?.ko) {
          let gain = att.card.prizeValue;
          if (denial && denialLeft > 0 && denialApplies(denial, att.card, hit.card)) { gain -= denial.amount; denialLeft--; step.denial = denial.label; }
          oppTaken += gain;
          myLeft.set(att.card.name, myLeft.get(att.card.name) - 1);
          if (myHpBonus) myCapeLeft = false;
          Object.assign(step, { ko: true, oppAttacker: hit.card.name, oppDmg: Math.round(hit.dmg), oppGain: gain, oppWeak: hit.weak, oppValue: hit.card.prizeValue });
        } else {
          // Checkup depois do turno dele: veneno do seu combo + veneno/queimadura que o ataque dele causou
          const oppChk = hit?.atk ? checkupDamage(hit.atk, hit.card, att.card, opp).dmg : 0;
          active = { att, card: att.card, dmgTaken: prevHits + (hit?.dmg ?? 0) + selfPoison + oppChk, cool: myDb.noAttack, needEnergy: myDb.discardEnergy ? (used?.cost ?? []).length : 0 };
          if (oppChk) step.oppCheckup = oppChk;
          Object.assign(step, { ko: false, oppAttacker: hit?.card.name, oppDmg: Math.round(hit?.dmg ?? 0), myCool: myDb.noAttack ? used?.name : null });
          // Contorna com Boss: nocauteia um Pokémon do seu banco
          if (state.oppGusts > 0 && !spreadOf(hit?.atk)) {
            let g = null;
            for (const b of myBench) {
              if (benchLost.includes(b.name) || b.name === att.card.name) continue;
              const h = oppChoose(b, opp, oppLeft, benchDmg[b.name] ?? 0, [], { cooldown: state.oppCooldown, wo: oppWO, oppTurn: depth + 1 + tempo });
              if (h?.ko && (!g || b.prizeValue > g.b.prizeValue)) g = { b, h };
            }
            if (g) {
              oppTaken += g.b.prizeValue;
              step.oppGust = { target: g.b.name, by: g.h.card.name, gain: g.b.prizeValue };
              benchLost.push(g.b.name);
              state = { ...state, oppGusts: state.oppGusts - 1 };
            }
          }
        }
        // Retaliação do seu Pokémon: quem atacou leva contadores (habilidade/Ferramenta "put N counters on the Attacking Pokémon"
        // ou o próprio ataque "no próximo turno dele, se receber dano…")
        if (hit?.card && hit.dmg > 0) {
          const rt = tagsOf(att.card).filter((t) => t.kind === 'RETALIATE' && !t.nextTurnOnly && (!t.whenKO || hit.ko));
          const amt = Math.max(0, ...rt.map((t) => t.amount)) + (myDb.retaliate ?? 0);
          if (amt > 0 && oppLeft.get(hit.card.name) > 0) {
            oppDmg[hit.card.name] = (oppDmg[hit.card.name] ?? 0) + amt;
            const dead = oppDmg[hit.card.name] >= hit.card.hp;
            step.retaliate = { amount: amt, on: hit.card.name, ko: dead };
            if (dead) { myTaken += hit.card.prizeValue; oppLeft.set(hit.card.name, oppLeft.get(hit.card.name) - 1); delete oppDmg[hit.card.name]; step.myTotal = myTaken; }
          }
        }
        // Dano espalhado no seu banco (ex.: Phantom Dive) — nocautes no banco também dão prêmio
        const spread = spreadOf(hit?.atk);
        if (spread) {
          const kos = applySpread(spread, myBench.filter((b) => b.name !== att.card.name), benchDmg, benchLost);
          for (const b of kos) { oppTaken += b.prizeValue; benchLost.push(b.name); }
          step.spread = { by: hit.card.name, amount: spread.amount, kos: kos.map((b) => `${b.name} (+${b.prizeValue})`) };
        }
        // Desvantagem do ataque do oponente: não ataca no próximo turno
        const oppDb = drawbackOf(hit?.atk);
        const oppCooldown = oppDb.noAttack ? hit.card.name : null;
        // Disrupção do oponente: Unfair Stamp depois do seu nocaute; Crushing Hammer tira energia
        let stampLeft = state.stampLeft;
        let stamped = false;
        if (pick && !pick.chip && stampLeft > 0) { stampLeft--; stamped = true; step.stamp = dis.stampName; }
        let hammer = state.hammer;
        let hammerHit = 0;
        if (hammer > 0) { hammer--; hammerHit = 1; step.hammer = dis.hammerName; }
        step.oppTotal = oppTaken;
        const shown = new Set(state.shown); if (hit?.card) shown.add(hit.card.name);
        const nextBank = Math.max(0, Math.min(6, bankAfter + income - (stamped ? 1 : 0) - hammerHit));
        rec({ myTaken, oppTaken, myLeft, oppLeft, oppDmg, tempo, active, oppActive: hit?.card.name ?? state.oppActive, gusts: gustsLeft, denialLeft, shown, gustsUsed, energySpent, bank: nextBank, oppGusts: state.oppGusts, benchLost, benchDmg, oppCooldown, capeLeft, myCapeLeft, hammer, stampLeft, stamped }, [...steps, step], depth + 1, key);
      }
    }
  }
  const myLeft = new Map(pool.map((p) => [p.card.name, p.count]));
  rec({ myTaken: 0, oppTaken: 0, myLeft, oppLeft: oppLeft0, oppDmg: {}, tempo: 0, active: null, oppActive: opener, gusts, denialLeft: denial ? (denial.uses ?? 1) : 0, shown: new Set([opener]), gustsUsed: 0, energySpent: 0, bank: SETUP_BANK, oppGusts: oppGusts0, benchLost: [], benchDmg: benchDmg0, oppCooldown: null, capeLeft: !!oppCape, myCapeLeft: !!myCape, hammer: dis.hammerBudget, stampLeft: dis.stampLeft, stamped: false }, [], 0);
  // Linha alternativa: melhor resultado que usa um conjunto diferente de atacantes
  const sig = (r) => [...new Set(r.steps.map((x) => x.attacker))].sort().join('+');
  const alt = best && finals.filter((r) => r.win === best.win && sig(r) !== sig(best)).sort((a, b) => b.score - a.score)[0];
  return { best, alt: alt ?? null, pool: pool.map((p) => p.card.name), engine: eng, gusts, opener, income, effects: { disruption: dis, oppCape: oppCape && { ...oppCape, on: capeOn }, oppWO, ruins: dis.ruins } };
}

function denialApplies(d, mine, theirs) {
  if (d.name) return mine.name === d.name;
  if (d.types && !(mine.types ?? []).some((t) => d.types.includes(t))) return false;
  if (d.vsEx && !theirs?.isEx) return false;
  if (d.prefix && !mine.name.startsWith(d.prefix)) return false;
  return true;
}

// Como uma carta reduz prêmios (Legacy Energy, Mega Gengar ex, Munkidori ex…)
const SYMT = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal' };
export function parseDenial(card, me) {
  const t = card.text;
  const m = t.match(/takes? (\d+) fewer prize/i);
  if (!m) return null;
  const amount = +m[1];
  const once = /can.t be applied more than once/i.test(t);
  const req = t.match(/if you have any (.+?) in play/i);
  if (req && !me.names.has(req[1].trim())) return { blocked: `exige ${req[1].trim()} em jogo` };
  const vsEx = /from your opponent.s pok[eé]mon ex/i.test(t);
  const label = card.name;
  if (/the pok[eé]mon this card is attached to/i.test(t)) {
    const lil = t.match(/the (\w+'s) pok[eé]mon this card is attached to/i);
    if (lil) { const who = me.entries.find((e) => e.card.name.startsWith(lil[1])); return who ? { name: who.card.name, amount, uses: once ? 1 : 99, label } : { blocked: `só funciona em Pokémon de ${lil[1]}` }; }
    return { name: me.mainAttacker?.name, amount, uses: once ? 1 : 99, label, attachTo: me.mainAttacker?.name };
  }
  const typed = t.match(/1 of your \{([A-Z])\} pok[eé]mon is knocked out/i);
  if (typed) return { types: [SYMT[typed[1]]], vsEx, amount, uses: 99, label, needsInPlay: card.name };
  if (/if this pok[eé]mon is knocked out/i.test(t)) return { name: card.name, amount, uses: 99, label, self: true };
  return null;
}

// Texto do plano em PT-BR
const pz = (n) => `${n} prêmio${n > 1 ? 's' : ''}`;
export function planText(plan) {
  if (!plan?.steps?.length) return [];
  return plan.steps.map((s, i) => {
    const who = `${s.attacker}${s.newAttacker && s.energy ? ` (entra com ${s.energy} energia${s.energy > 1 ? 's' : ''})` : ''}`;
    let mine;
    if (s.chip?.sturdy) mine = `${who} bateria o suficiente, mas o ${s.chip.target} está com HP cheio e aguenta com ${s.chip.left} HP (habilidade): o nocaute fica para o próximo ataque.`;
    else if (s.chip) mine = `${who} causa ~${s.chip.dmg}${s.chip.checkup ? ` (+${s.chip.checkup.dmg} de ${s.chip.checkup.why} no Checkup)` : ''} no ${s.chip.target}: não nocauteia, mas ele fica com ${s.chip.left} HP.`;
    else if (!s.target) mine = `${who} ataca o Ativo dele, mas não nocauteia.`;
    else if (s.gust) {
      const opts = (s.alts?.length ? s.alts : [s.target]).slice(0, 3).join(', ');
      const why = s.activeValue < s.prizes ? `o Ativo dele vale só ${pz(s.activeValue)}` : 'o Ativo dele não cai';
      mine = `Como ${why}: Boss's Orders num Pokémon de ${pz(s.prizes)} que você nocauteia (${opts}) e ataque com ${who} (~${s.dmg}). Você: ${s.myTotal}/6.`;
    } else if (s.pulled) mine = `${who} usa "${s.attack}": puxa ${s.target} do banco dele e nocauteia (${pz(s.prizes)}, ~${s.dmg}) sem gastar Boss. Você: ${s.myTotal}/6.`;
    else mine = `${who} nocauteia o Ativo dele, ${s.target} (${pz(s.prizes)}), sem gastar Boss (~${s.dmg}). Você: ${s.myTotal}/6.`;
    if (s.target && s.had) mine += ` (Ele já tinha ${s.had} de dano.)`;
    if (s.target && s.checkup) mine += ` (Cai no Checkup: +${s.checkup.dmg} de ${s.checkup.why}.)`;
    if (s.stamped) mine = `(Depois do Unfair Stamp você está com 2 cartas: sem Boss neste turno.) ${mine}`;
    if (s.pre) mine = `Antes: ${s.attacker} é evolução e só ataca no seu 2º turno, então ${s.pre.by} ataca primeiro${s.pre.atk ? ` ("${s.pre.atk}")` : ''} no ${s.pre.target}: ${s.pre.ko ? `nocauteia → +${s.pre.prizes} para ele` : `${s.pre.dmg} de dano, que continuam no ${s.attacker} depois de evoluir`}. ${mine}`;
    if (s.capeBroken) mine += ` (Ele tinha ${s.capeBroken}: +HP considerado.)`;
    const extras = [];
    if (s.spread) extras.push(`${s.spread.by} espalha ${s.spread.amount} no seu banco${s.spread.kos.length ? ` e nocauteia ${s.spread.kos.join(', ')}` : ''}`);
    if (s.stamp) extras.push(`seu nocaute libera ${s.stamp}: você fica com 2 cartas`);
    if (s.hammer) extras.push(`${s.hammer} tira 1 energia sua`);
    if (s.myCool) extras.push(`"${s.myCool}" não pode ser usado no seu próximo turno`);
    if (s.oppCheckup) extras.push(`o ${s.attacker} toma +${s.oppCheckup} no Checkup (veneno/queimadura)`);
    if (s.retaliate) extras.push(`${s.attacker} devolve ${s.retaliate.amount} em contadores no ${s.retaliate.on}${s.retaliate.ko ? ` e nocauteia → você: ${s.myTotal}/6` : ''}`);
    if (s.theirRetaliate) extras.push(`${s.theirRetaliate.from} devolveu ${s.theirRetaliate.amount} em contadores no ${s.attacker}`);
    if (s.locked) extras.push(`o ${s.locked} não pode atacar no turno dele ("${s.attack}")`);
    if (s.shield && !s.ko) extras.push(`"${s.attack}" protege o ${s.attacker} (${s.shield >= 999 ? 'sem dano' : `−${s.shield}`}) no turno dele`);
    const tail = extras.length ? ` Além disso: ${extras.join('; ')}. Ele: ${s.oppTotal}/6.` : '';
    const theirs0 = s.myTotal >= 6 ? '🏆 Você pega o último prêmio.' : s.ko
      ? `Ele responde: ${s.oppAttacker} nocauteia ${s.attacker}${s.oppWeak ? ' (fraqueza)' : ''} → +${s.oppGain}${s.denial ? ` (${s.denial}: −1)` : ''}. Ele: ${s.oppTotal}/6.`
      : s.oppGust ? `Ele não passa pelo ${s.attacker}, então usa Boss's Orders: ${s.oppGust.by} nocauteia o seu ${s.oppGust.target} no banco → +${s.oppGust.gain}. Ele: ${s.oppTotal}/6.`
      : `Ele não consegue nocautear ${s.attacker} neste turno.`;
    const theirs = s.myTotal >= 6 ? theirs0 : theirs0 + (/\/6\.$/.test(theirs0) ? tail.replace(/ Ele: \d+\/6\.$/, '') : tail);
    return { turn: i + 1, mine, theirs };
  });
}
