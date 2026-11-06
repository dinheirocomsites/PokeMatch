// Plano de jogo: QUEM derrubar primeiro no deck dele e COMO o seu deck derruba — tudo conferido pelas contas do motor.
// Ideia (caso do Felipe, Dragapult × Hydrapple): a melhor resposta muitas vezes não é uma carta nova, é desmontar o
// combo dele — o Meganium que dobra a energia, a linha Applin → Dipplin antes de virar Hydrapple ex.
import { damageVs } from './damage.js';
import { spreadOf } from './prizes.js';
import { extractTags, attackDamage } from './tags.js';

const SYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Dragon: 'N', Colorless: 'C' };
const abil = (c, re) => (c.abilities ?? []).find((a) => re.test(a.effect ?? ''));
const DOUBLE = /provides \{([a-z])\}\{\1\}/i;
const ACCEL = /attach (a|up to \d+|\d+) (basic )?(\{[a-z]\} )?energy/i;
const DRAW = /draw (\d+|a) cards?/i;

// Cadeia de evolução até um Pokémon (Applin → Dipplin → Hydrapple ex), só com o que está na lista dele
function lineOf(card, opp) {
  const chain = [];
  let c = card;
  while (c?.evolveFrom) {
    const prev = opp.entries.find((e) => e.card.name === c.evolveFrom)?.card;
    if (!prev) break;
    chain.unshift(prev);
    c = prev;
  }
  return chain; // do Básico para cima, sem o próprio card
}

// Como o SEU deck derruba um alvo: dano espalhado no banco (sem precisar de Boss) ou no Ativo (com Boss), ou em 2 ataques
const SELF_HURT = /place \d+ damage counters on that pok[eé]mon|also does \d+ damage to itself|damage to 1 of your benched/i;
function howToKo(target, me, opp, gusts, koGap = null) {
  const attackers = me.threat.filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).some((a) => attackDamage(a) || spreadOf(a)));
  const selfDamaged = me.entries.some((e) => SELF_HURT.test(e.card.text ?? ''));
  // dano que você coloca em QUALQUER Pokémon dele sem atacar (Munkidori "Adrena-Brain": move 3 contadores por turno)
  let pas = null;
  for (const e of me.entries.filter((x) => x.card.category === 'Pokemon')) for (const ab of e.card.abilities ?? []) {
    const m = (ab.effect ?? '').match(/(?:move|put) up to (\d+) damage counters? (?:from 1 of your pok[eé]mon )?(?:to|on) 1 of your opponent.s pok[eé]mon/i) ?? (ab.effect ?? '').match(/put (\d+) damage counters? on 1 of your opponent.s pok[eé]mon/i);
    if (m && (!pas || +m[1] * 10 > pas.amount)) pas = { amount: +m[1] * 10, by: e.card.name, ability: ab.name };
  }
  const plus = pas ? ` + ${pas.amount} do ${pas.by} ("${pas.ability}")` : '';
  let best = null;
  // mesmo resultado: prefere o seu atacante principal (é ele que vai estar pronto)
  const consider = (opt) => { const k = opt.ease + (opt.mainAtk ? 0.01 : 0), kb = best ? best.ease + (best.mainAtk ? 0.01 : 0) : -1; if (!best || k > kb || (k === kb && opt.dmg > best.dmg)) best = opt; };
  for (const e of attackers) {
    const mainAtk = e.card === me.mainAttacker;
    for (const a of e.card.attacks ?? []) {
      const sp = spreadOf(a);
      if (sp && (!sp.exOnly || target.isEx)) {
        const amt = sp.amount;
        if (amt >= target.hp) consider({ ease: 1, dmg: amt, mainAtk, text: `os ${amt} ${sp.mode === 'distribute' ? 'espalhados' : 'de dano'} no banco do "${a.copiedAttack ?? a.name}" (${e.card.name}) derrubam ele sem precisar de Boss` });
        else if (pas && amt + pas.amount >= target.hp) consider({ ease: 0.95, dmg: amt + pas.amount, mainAtk, text: `os ${amt} ${sp.mode === 'distribute' ? 'espalhados' : 'de dano'} no banco do "${a.copiedAttack ?? a.name}" (${e.card.name})${plus} derrubam ele no banco, sem precisar de Boss` });
      }
      const dmg = damageVs(a, e.card, target, { deck: me, defDeck: opp, oppTaken: 3, selfDamaged, ...(me.pressure ?? {}) }).dmg;
      if (dmg >= target.hp) consider({ ease: 0.85, dmg, mainAtk, text: `no Ativo, "${a.copiedAttack ?? a.name}" do ${e.card.name} faz ${Math.round(dmg)} e derruba${gusts ? " (puxe com Boss's Orders se ele estiver no banco)" : ''}` });
      else if (pas && dmg > 0 && dmg + pas.amount >= target.hp) consider({ ease: 0.85, dmg: dmg + pas.amount, mainAtk, text: `no Ativo, "${a.copiedAttack ?? a.name}" do ${e.card.name} faz ${Math.round(dmg)}${plus} = ${Math.round(dmg + pas.amount)} e derruba num ataque só${gusts ? " (puxe com Boss's Orders se ele estiver no banco)" : ''}` });
      else if (dmg * 2 >= target.hp && dmg > 0) consider({ ease: 0.5, dmg, mainAtk, text: `"${a.copiedAttack ?? a.name}" do ${e.card.name} faz ${Math.round(dmg)} de ${target.hp}: derruba em 2 ataques` });
    }
  }
  // o atacante principal dele: se com tudo montado o seu atacante fecha a conta, é isso que importa dizer
  if (koGap && koGap.target === target.name && koGap.full >= target.hp && (!best || best.ease < 0.85)) {
    const pieces = (koGap.pieces ?? []).map((p) => `${p.name} +${p.amount}`).join(', ');
    return { ease: 0.8, dmg: koGap.full, text: `com tudo montado (${pieces}) o ${me.mainAttacker.name} chega a ${koGap.full} e derruba em 1 ataque — sozinho faz ${koGap.alone}` };
  }
  return best ?? { ease: 0.25, dmg: 0, text: 'o seu deck não derruba ele com facilidade' };
}

export function gamePlan(me, opp, { gusts = 0, koGap = null } = {}) {
  const main = opp.mainAttacker;
  if (!main) return { main: null, targets: [] };
  const myMain = me.mainAttacker;
  const mainLine = lineOf(main, opp);
  const cands = new Map(); // nome → { card, roles: [{ w, why }] }
  const add = (card, w, why) => {
    if (!card) return;
    const x = cands.get(card.name) ?? { card, roles: [] };
    x.roles.push({ w, why });
    cands.set(card.name, x);
  };
  const countOf = (name) => opp.entries.filter((e) => e.card.name === name).reduce((n, e) => n + e.count, 0);
  // o atacante principal e a linha dele
  const mainAtk = [...(main.attacks ?? [])].sort((a, b) => attackDamage(b) - attackDamage(a))[0];
  const vsMine = myMain && mainAtk ? Math.round(damageVs(mainAtk, main, myMain, { deck: opp, defDeck: me, oppTaken: 3 }).dmg) : 0;
  add(main, 2.0, `é o atacante principal dele${vsMine ? ` ("${mainAtk.name}": ~${vsMine} no seu ${myMain.name}, ${myMain.hp} HP)` : ''}`);
  mainLine.forEach((c, i) => add(c, i === 0 ? 2.6 : 2.4, `${i === mainLine.length - 1 ? `evolui direto para o ${main.name}` : `é o começo da linha do ${main.name}`} — derrubar antes de evoluir corta o atacante principal`));
  // outros atacantes de verdade dele (Metagross no deck do Excadrill, Latias ex…)
  const tot = opp.totalThreat || 1;
  for (const e of opp.threat.filter((x) => x.card !== main && !x.stepping && x.feas >= 0.3 && x.threat / tot >= 0.12)) {
    const a = [...(e.card.attacks ?? [])].sort((x, y) => attackDamage(y) - attackDamage(x))[0];
    const d = myMain && a ? Math.round(damageVs(a, e.card, myMain, { deck: opp, defDeck: me, oppTaken: 3 }).dmg) : 0;
    add(e.card, 1.5, `também ataca forte${d ? ` ("${a.copiedAttack ?? a.name}": ~${d} no seu ${myMain.name})` : ''}`);
  }
  // peças que dobram energia, aceleram, dão dano extra, copiam ataques ou compram cartas
  for (const e of opp.entries.filter((x) => x.card.category === 'Pokemon' && x.card !== main)) {
    const c = e.card;
    // quem COPIA ataques (Slowking + Academy at Night → Trifrost do Kyurem): a peça mais perigosa costuma ser ela
    // dano TOTAL do ataque (Trifrost: 110 em 3 Pokémon = 330) para escolher a cópia mais perigosa
    // (ataque só no banco — Thunder Raid — não tem dano no Ativo: não conta duas vezes)
    const total = (a) => { const sp = spreadOf(a); return sp ? (sp.withActive ? sp.amount * (sp.count + 1) : (a.damage ? attackDamage(a) : 0) + sp.amount * (sp.count ?? 1)) : attackDamage(a); };
    const label = (a) => { const sp = spreadOf(a); return !sp ? '' : sp.withActive ? ` (${sp.amount} em ${sp.count + 1} Pokémon seus)` : ` (${sp.amount} em ${sp.count ?? 1} Pokémon${sp.exOnly ? ' ex' : ''} do seu banco)`; };
    const copied = (c.attacks ?? []).filter((a) => a.copiedFrom).sort((a, b) => total(b) - total(a));
    if (copied.length) {
      const top = copied[0];
      add(c, 2.8, `copia ataques de outros Pokémon pagando ${(top.cost ?? []).map((t) => `{${SYM[t] ?? t[0]}}`).join('')} — ex.: "${top.copiedAttack}" do ${top.copiedFrom}${label(top)}`);
      lineOf(c, opp).forEach((p) => add(p, 2.2, `é a linha do ${c.name} (que copia ataques) — derrubar antes de evoluir`));
    }
    const dbl = abil(c, DOUBLE);
    if (dbl) {
      const t = (c.abilities.find((a) => a === dbl).effect.match(DOUBLE) ?? [])[1]?.toUpperCase();
      const counts = (main.attacks ?? []).some((a) => /for each \{?[a-z]?\}? ?energy/i.test(a.effect ?? ''));
      add(c, 3.0, `"${dbl.name}": cada Energia {${t}} vale 2${counts ? ` — o "${mainAtk?.name}" do ${main.name} conta energia, então bate o dobro` : ''}`);
      lineOf(c, opp).forEach((p) => add(p, 2.0, `é a linha do ${c.name} ("${dbl.name}") — derrubar antes de evoluir`));
    }
    const acc = abil(c, ACCEL);
    if (acc) add(c, 2.2, `"${acc.name}": liga energia extra todo turno`);
    const boost = extractTags(c).find((t) => t.kind === 'EXTRA_DMG' && t.source === 'ability');
    if (boost) add(c, 2.2, `"${boost.name}": +${boost.amount} de dano nos ataques dele`);
    const draw = abil(c, DRAW);
    if (draw && !acc) add(c, 1.0, `"${draw.name}": compra cartas para ele`);
  }
  const targets = [...cands.values()].map(({ card, roles }) => {
    const how = howToKo(card, me, opp, gusts, koGap);
    const w = Math.max(...roles.map((r) => r.w));
    return { name: card.name, hp: card.hp, prize: card.prizeValue ?? 1, count: countOf(card.name), stage: card.stage ?? 'Basic', why: roles.sort((a, b) => b.w - a.w).map((r) => r.why).join('; '), how: how.text, ko: how.ease >= 0.85 ? 'sim' : how.ease >= 0.5 ? '2 ataques' : 'difícil', score: Math.round(w * how.ease * 100) / 100 };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
  return { main: main.name, targets };
}
