// Simulador de corrida de prêmios.
// Modelo simplificado, turno a turno: você ataca com um Pokémon e nocauteia o
// melhor alvo que consegue; o oponente responde nocauteando o seu atacante.
// O dano depende do estado (prêmios já pegos, Pokémon ferido, envenenado…).
import { attackDamage, extractTags, matches } from './tags.js';
import { potentialDamage, multiplier } from './fit.js';

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
function myDamage(card, attack, target, state, me, eng) {
  const d = String(attack.damage ?? '');
  const n = parseInt(d, 10) || 0;
  const eff = attack.effect ?? '';
  let dmg;
  const notes = [];
  if (/[×x]$/.test(d)) {
    if (/for each prize card your opponent has taken/i.test(eff)) { dmg = n * state.oppTaken; notes.push(`${n}×${state.oppTaken} prêmios`); }
    else dmg = n * multiplier(eff, me);
  } else if (d.endsWith('+')) {
    const more = +(eff.match(/(\d+) more damage/i)?.[1] ?? 0);
    if (/if this pok[eé]mon has any damage counters/i.test(eff)) { dmg = n + (eng.selfDamage ? more : 0); if (eng.selfDamage) notes.push('ferido'); }
    else if (/for each/i.test(eff)) dmg = n + more * multiplier(eff, me);
    else dmg = n + more / 2;
  } else dmg = attackDamage(attack);
  if (!dmg) return { dmg: 0, notes };
  const ps = eng.poisonSwitch;
  if (ps && eng.poisonBoost && (card.types ?? []).some((t) => SYM[t] === ps.sym) && !ps.except.includes(card.name)) { dmg += eng.poisonBoost; notes.push(`+${eng.poisonBoost} envenenado`); }
  if ((target.weaknesses ?? []).some((w) => (card.types ?? []).includes(w.type))) { dmg *= 2; notes.push('fraqueza'); }
  if ((target.resistances ?? []).some((r) => (card.types ?? []).includes(r.type))) dmg -= 30;
  if (eng.passive) { dmg += eng.passive; notes.push(`+${eng.passive} ${eng.passiveBy}`); }
  return { dmg, notes };
}

// Maior dano do oponente num Pokémon meu
function oppBest(target, opp, oppLeft) {
  let best = { dmg: 0, by: null };
  for (const e of opp.threat) {
    if (!oppLeft.get(e.card.name) || e.feas < 0.3) continue;
    for (const a of e.card.attacks ?? []) {
      let dmg = potentialDamage(a, opp);
      if (!dmg) continue;
      if ((target.weaknesses ?? []).some((w) => (e.card.types ?? []).includes(w.type))) dmg *= 2;
      if ((target.resistances ?? []).some((r) => (e.card.types ?? []).includes(r.type))) dmg -= 30;
      if (dmg > best.dmg) best = { dmg, by: e.card.name, weak: (target.weaknesses ?? []).some((w) => (e.card.types ?? []).includes(w.type)) };
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
function oppChoose(target, opp, oppLeft, hitsTaken) {
  const opts = [];
  const walls = wallsOf(target);
  for (const e of opp.threat) {
    if (!oppLeft.get(e.card.name) || e.feas < 0.3) continue;
    if (walls.some((w) => matches(w.sel, e.card))) continue; // muralha: esse atacante não causa dano
    let dmg = 0;
    let weak = false;
    for (const a of e.card.attacks ?? []) {
      let d = potentialDamage(a, opp);
      if (!d) continue;
      const w = (target.weaknesses ?? []).some((x) => (e.card.types ?? []).includes(x.type));
      if (w) d *= 2;
      if ((target.resistances ?? []).some((r) => (e.card.types ?? []).includes(r.type))) d -= 30;
      if (d > dmg) { dmg = d; weak = w; }
    }
    if (dmg) opts.push({ card: e.card, dmg, weak, ko: dmg + hitsTaken >= target.hp });
  }
  const kos = opts.filter((o) => o.ko).sort((a, b) => a.card.prizeValue - b.card.prizeValue || b.card.hp - a.card.hp);
  if (kos.length) return kos[0];
  return opts.sort((a, b) => b.dmg - a.dmg)[0] ?? null;
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
  const gustCards = me.entries.filter((e) => /switch in 1 of your opponent.s benched/i.test(e.card.text)).reduce((s, e) => s + e.count, 0);
  const gusts = Math.min(3, Math.ceil(gustCards / 2)); // nem todos os Boss aparecem a tempo
  // Quem o oponente começa atacando: o atacante que mais pressiona
  // O oponente abre com quem mata o seu atacante principal entregando menos prêmios
  const oppLeft0 = new Map(targets.map((t) => [t.name, opp.entries.find((e) => e.card.name === t.name).count]));
  const opener = (me.mainAttacker && oppChoose(me.mainAttacker, opp, oppLeft0, 0)?.card.name)
    ?? [...opp.threat].filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).length).sort((a, b) => b.threat - a.threat)[0]?.card.name;
  // No banco dele (alcançável com Boss): Pokémon com habilidade que funciona no banco + os que já atacaram
  const benchy = new Set(targets.filter((t) => (t.abilities ?? []).some((a) => !/in the active spot/i.test(a.effect ?? ''))).map((t) => t.name));

  const income = 1 + (eng.accel ? 1 : 0); // energia por turno: 1 manual + aceleração
  const SETUP_BANK = 3; // energia montada antes do primeiro ataque
  const killsMain = new Set(me.mainAttacker ? opp.threat.filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).some((a) => { let d = potentialDamage(a, opp); if ((me.mainAttacker.weaknesses ?? []).some((w) => (e.card.types ?? []).includes(w.type))) d *= 2; return d >= me.mainAttacker.hp - 20; })).map((e) => e.card.name) : []);
  let best = null;
  const finals = [];
  const memo = new Map();
  function rec(state, steps, depth) {
    const key = `${state.bank}|${state.gustsUsed}|${state.energySpent}|${state.myTaken}|${state.oppTaken}|${state.active?.card.name}|${state.active?.dmgTaken}|${[...state.shown].sort()}|${state.oppActive}|${state.gusts}|${[...state.myLeft.values()]}|${[...state.oppLeft.values()]}|${state.denialLeft}`;
    if (memo.has(key) && memo.get(key) <= depth) return;
    memo.set(key, depth);
    if (state.myTaken >= 6 || state.oppTaken >= 6 || depth >= maxTurns) {
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
      const continuing = state.active?.att === att;
      // Opções de alvo: o Ativo dele (de graça) ou o melhor alvo com Boss
      const options = [];
      // Só ataques que dá para energizar: o atacante atual já está pronto; um novo precisa sair do "banco de energia"
      const payable = (a) => continuing || (a.cost ?? []).length <= state.bank;
      const ko = (t) => { let r = null; for (const a of att.atks) { if (!payable(a)) continue; const x = myDamage(att.card, a, t, state, meX, eng); if (x.dmg >= (t.hp ?? 999) && (!r || (a.cost ?? []).length < (r.a.cost ?? []).length || x.dmg > r.r.dmg)) r = { a, r: x }; } return r; };
      if (!continuing && !att.atks.some(payable)) continue;
      const act = targets.find((t) => t.name === state.oppActive && state.oppLeft.get(t.name));
      const kAct = act && ko(act);
      if (kAct) options.push({ t: act, ...kAct, gust: false });
      if (state.gusts > 0) {
        let g = null;
        for (const t of targets) {
          if (!state.oppLeft.get(t.name) || t.name === state.oppActive || !(benchy.has(t.name) || state.shown.has(t.name))) continue;
          const k = ko(t);
          // Entre alvos de mesmo valor, prefere quem mata o seu atacante principal
          const rank = (x) => x.t.prizeValue * 10 + (killsMain.has(x.t.name) ? 1 : 0);
          if (k && (!g || rank({ t }) > rank(g))) g = { t, ...k, gust: true };
        }
        if (g && (!kAct || g.t.prizeValue > act.prizeValue)) options.push(g);
      }
      if (!options.length) options.push(null);
      for (const pick of options) {
        const myLeft = new Map(state.myLeft);
        const oppLeft = new Map(state.oppLeft);
        let myTaken = state.myTaken;
        let gustsLeft = state.gusts;
        const step = { attacker: att.card.name, prizeValue: att.card.prizeValue, vsActive: state.oppActive, activeValue: targets.find((t) => t.name === state.oppActive)?.prizeValue };
        const used = pick?.a ?? att.atks.filter(payable).sort((a, b) => (a.cost ?? []).length - (b.cost ?? []).length)[0];
        const spend = continuing ? 0 : (used?.cost ?? []).length;
        step.newAttacker = !continuing;
        step.energy = spend;
        step.killsMain = pick && killsMain.has(pick.t.name);
        if (pick) {
          myTaken += pick.t.prizeValue;
          oppLeft.set(pick.t.name, oppLeft.get(pick.t.name) - 1);
          if (pick.gust) gustsLeft--;
          Object.assign(step, { attack: pick.a.name, target: pick.t.name, gust: pick.gust, dmg: Math.round(pick.r.dmg), hp: pick.t.hp, notes: pick.r.notes, prizes: pick.t.prizeValue });
        } else Object.assign(step, { attack: null, target: null, prizes: 0, vs: state.oppActive });
        step.myTotal = myTaken;
        const bankAfter = state.bank - spend;
        const gustsUsed = state.gustsUsed + (pick?.gust ? 1 : 0);
        const energySpent = state.energySpent + spend;
        if (myTaken >= 6) { rec({ ...state, myTaken, myLeft, oppLeft, gusts: gustsLeft, gustsUsed, energySpent, bank: bankAfter }, [...steps, step], depth + 1); continue; }
        // Atacante que depende de estar ferido (ex.: Hungry Jaws) entra no ataque já com dano
        const selfHurt = pick && eng.selfDamage && /if this pok[eé]mon has any damage counters/i.test(pick.a.effect ?? '') ? eng.selfDmgAmount : 0;
        const prevHits = (state.active?.att === att ? state.active.dmgTaken : 0) + (state.active?.att === att ? 0 : selfHurt);
        const hit = oppChoose(att.card, opp, oppLeft, prevHits);
        let oppTaken = state.oppTaken;
        let active = null;
        let denialLeft = state.denialLeft;
        if (hit?.ko) {
          let gain = att.card.prizeValue;
          if (denial && denialLeft > 0 && denialApplies(denial, att.card, hit.card)) { gain -= denial.amount; denialLeft--; step.denial = denial.label; }
          oppTaken += gain;
          myLeft.set(att.card.name, myLeft.get(att.card.name) - 1);
          Object.assign(step, { ko: true, oppAttacker: hit.card.name, oppDmg: Math.round(hit.dmg), oppGain: gain, oppWeak: hit.weak, oppValue: hit.card.prizeValue });
        } else {
          active = { att, card: att.card, dmgTaken: prevHits + (hit?.dmg ?? 0) };
          Object.assign(step, { ko: false, oppAttacker: hit?.card.name, oppDmg: Math.round(hit?.dmg ?? 0) });
        }
        step.oppTotal = oppTaken;
        const shown = new Set(state.shown); if (hit?.card) shown.add(hit.card.name);
        rec({ myTaken, oppTaken, myLeft, oppLeft, active, oppActive: hit?.card.name ?? state.oppActive, gusts: gustsLeft, denialLeft, shown, gustsUsed, energySpent, bank: Math.min(6, bankAfter + income) }, [...steps, step], depth + 1);
      }
    }
  }
  const myLeft = new Map(pool.map((p) => [p.card.name, p.count]));
  rec({ myTaken: 0, oppTaken: 0, myLeft, oppLeft: oppLeft0, active: null, oppActive: opener, gusts, denialLeft: denial ? (denial.uses ?? 1) : 0, shown: new Set([opener]), gustsUsed: 0, energySpent: 0, bank: SETUP_BANK }, [], 0);
  // Linha alternativa: melhor resultado que usa um conjunto diferente de atacantes
  const sig = (r) => [...new Set(r.steps.map((x) => x.attacker))].sort().join('+');
  const alt = best && finals.filter((r) => r.win === best.win && sig(r) !== sig(best)).sort((a, b) => b.score - a.score)[0];
  return { best, alt: alt ?? null, pool: pool.map((p) => p.card.name), engine: eng, gusts, opener, income };
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
export function planText(plan) {
  if (!plan?.steps?.length) return [];
  return plan.steps.map((s, i) => {
    const front = s.vsActive ? `Ativo dele: ${s.vsActive}${s.activeValue ? ` (${s.activeValue} prêmio${s.activeValue > 1 ? 's' : ''})` : ''}. ` : '';
    const ready = s.newAttacker && s.energy ? ` [entra no ataque: ${s.energy} energia${s.energy > 1 ? 's' : ''}]` : '';
    let mine;
    if (!s.target) mine = `${front}${s.attacker}${ready} ataca, mas não nocauteia ninguém (sem prêmio).`;
    else if (s.gust) mine = `${front}${s.vsActive && s.activeValue < s.prizes ? `Ele só vale ${s.activeValue}, então ` : 'Ele não cai, então '}Boss's Orders no ${s.target}${s.killsMain ? ' (o atacante que mata o seu principal)' : ''} e ${s.attacker}${ready} ataca com "${s.attack}" (~${s.dmg}${s.notes?.length ? `: ${s.notes.join(', ')}` : ''}) → nocauteia (+${s.prizes}). Você: ${s.myTotal}/6.`;
    else mine = `${front}${s.attacker}${ready} ataca com "${s.attack}" (~${s.dmg}${s.notes?.length ? `: ${s.notes.join(', ')}` : ''}) → nocauteia ${s.target} sem precisar de Boss (+${s.prizes}). Você: ${s.myTotal}/6.`;
    const theirs = s.myTotal >= 6 ? '🏆 Você pega o último prêmio.' : s.ko
      ? `Oponente: ${s.oppAttacker} nocauteia ${s.attacker}${s.oppWeak ? ' (fraqueza)' : ''} → +${s.oppGain}${s.denial ? ` (${s.denial}: −1)` : ''}. Ele: ${s.oppTotal}/6.`
      : `Oponente não nocauteia ${s.attacker} neste turno${s.oppAttacker ? ` (${s.oppAttacker} faz ~${s.oppDmg})` : ''}.`;
    return { turn: i + 1, mine, theirs };
  });
}
