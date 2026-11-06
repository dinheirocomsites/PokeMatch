// Sinergia: monta o PACOTE completo de uma tech (pré-evolução na melhor versão,
// a carta, energia habilitadora), descobre cadeias de combo com cartas que o
// jogador já usa e calcula o dano real da tech dentro do deck.
import { attackDamage, typePt, matches } from './tags.js';
import { damageVs } from './damage.js';

const SYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M' };
const canPay = (cost, types) => (cost ?? []).every((t) => t === 'Colorless' || types.has(t));
const reTypeIn = (text, re, types) => {
  const m = text.match(re);
  if (!m) return null;
  const sym = m[1];
  return types.some((t) => SYM[t] === sym) ? m : null;
};

// Energias que precisariam entrar para a carta atacar
export function missingEnergy(card, me) {
  const options = [];
  for (const a of card.attacks ?? []) {
    if (!attackDamage(a)) continue;
    const need = {};
    for (const t of a.cost ?? []) if (t !== 'Colorless' && !me.energyTypes.has(t)) need[t] = (need[t] ?? 0) + 1;
    const types = Object.keys(need);
    if (types.length === 1 && need[types[0]] <= 2) options.push({ type: types[0], qty: need[types[0]], attack: a });
  }
  return options.sort((a, b) => attackDamage(b.attack) - attackDamage(a.attack))[0] ?? null;
}

// Escolhe a melhor versão da pré-evolução (cartas com mesmo nome podem ter textos diferentes)
function bestPrevo(card, me, energyTypes, db) {
  if (!card.evolveFrom) return null;
  const versions = db.versionsByName.get(card.evolveFrom.toLowerCase()) ?? [];
  const wantsDamaged = me.mainAttacker && /if this pok[eé]mon has any damage counters/i.test(me.mainAttacker.text);
  let best = null;
  for (const v of versions) {
    let score = v.hp / 100;
    const notes = [];
    for (const a of v.attacks ?? []) {
      if (!canPay(a.cost, energyTypes)) continue;
      const dmg = attackDamage(a);
      let s = dmg / 30 + (a.cost?.length === 1 ? 1 : 0);
      if (/damage to 1 of your benched/i.test(a.effect ?? '') && wantsDamaged) {
        s += 2;
        notes.push(`"${a.name}" (${a.cost.length} energia, ${dmg} de dano) também coloca dano no seu banco — ativa o "${me.mainAttacker.attacks.find((x) => /damage counters/i.test(x.effect ?? ''))?.name ?? 'bônus'}" do ${me.mainAttacker.name}`);
      } else if (dmg) notes.push(`"${a.name}": ${dmg} de dano por ${a.cost.length} energia`);
      score += s;
    }
    if (!best || score > best.score) best = { card: v, score, notes };
  }
  return best;
}

// Cadeias de combo entre a tech e cartas do deck do jogador
export function findCombos(card, me, energyTypes) {
  const combos = [];
  const types = card.types ?? [];
  let boost = 0;
  let passive = 0;
  let poisonedBy = null;
  for (const { entry } of me.tagsByCard) {
    const c = entry.card;
    if (c.name === card.name) continue;
    for (const a of [...(c.abilities ?? []), ...(c.attacks ?? []), ...(c.effect ? [{ name: c.name, effect: c.effect }] : [])]) {
      const t = a.effect ?? '';
      // Acelera energia para Pokémon do tipo dela
      if (reTypeIn(t, /attach it to 1 of your benched \{([A-Z])\} pok[eé]mon/i, types)) combos.push({ with: c.name, text: `${c.name} ("${a.name}") liga energia nela direto do deck — é do tipo ${typePt(types[0])}.` });
      // Sobe ela para o Ativo (e talvez envenena)
      const sw = reTypeIn(t, /switch 1 of your benched \{([A-Z])\} pok[eé]mon/i, types);
      if (sw) {
        const poison = /is now poisoned/i.test(t);
        if (poison) poisonedBy = c.name;
        combos.push({ with: c.name, text: `${c.name} ("${a.name}") coloca ela no Ativo${poison ? ' envenenada' : ''} sem gastar recuo.` });
      }
      // Dano passivo por turno
      if (/move up to (\d+) damage counters from 1 of your pok[eé]mon to 1 of your opponent/i.test(t)) {
        const n = +t.match(/move up to (\d+) damage counters/i)[1];
        const needs = t.match(/has any \{([A-Z])\} energy attached/i);
        if (!needs || energyTypes.has(Object.keys(SYM).find((k) => SYM[k] === needs[1]))) {
          passive = Math.max(passive, n * 10);
          combos.push({ with: c.name, text: `${c.name} ("${a.name}") move ${n * 10} de dano dos seus Pokémon para o oponente todo turno — soma com o ataque dela.` });
        }
      }
    }
  }
  // Ferramentas que dão dano extra sob condição (ex.: Binding Mochi + envenenado)
  for (const { entry } of me.tagsByCard) {
    const t = entry.card.text;
    const m = t.match(/attacks used by the poisoned pok[eé]mon this card is attached to do (\d+) more damage/i);
    if (m && poisonedBy) {
      boost += +m[1];
      combos.push({ with: entry.card.name, text: `${entry.card.name}: envenenada pelo ${poisonedBy}, ela bate +${m[1]}.` });
    }
  }
  return { combos, boost, passive };
}

// Dano real da tech no deck + quem ela nocauteia em 1 ataque
export function realDamage(card, me, opp, energyTypes, combo) {
  const atks = (card.attacks ?? []).filter((a) => (attackDamage(a) || /more damage|for each/i.test(a.effect ?? '')) && canPay(a.cost, energyTypes));
  if (!atks.length) return null;
  const selfDamaged = me.entries.some((e) => /place \d+ damage counters on that pok[eé]mon|also does \d+ damage to itself|damage to 1 of your benched/i.test(e.card.text));
  const kos = [];
  let koThreat = 0;
  let shown = null; // ataque e dano contra o alvo mais relevante, para a explicação
  const attackThreat = opp.threat.filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).some((a) => attackDamage(a))).reduce((s, e) => s + e.threat, 0) || 1;
  for (const e of opp.threat) {
    let best = null;
    for (const a of atks) {
      const r = damageVs(a, card, e.card, { deck: me, oppTaken: 3, selfDamaged, bonus: combo.boost, ...me.pressure });
      if (!best || r.dmg > best.dmg) best = { ...r, attack: a };
    }
    const total = best.dmg + combo.passive;
    if (total >= e.card.hp) {
      kos.push(`${e.card.name}${best.notes.includes('fraqueza') ? ' (fraqueza!)' : ''}`);
      koThreat += e.threat;
      if (!shown || e.threat > shown.threat) shown = { ...best, total, threat: e.threat, target: e.card.name };
    }
  }
  const top = shown ?? { attack: atks[0], dmg: attackDamage(atks[0]) + combo.boost, total: attackDamage(atks[0]) + combo.boost + combo.passive, notes: [] };
  return {
    attack: top.attack, base: top.dmg - combo.boost, boost: combo.boost, passive: combo.passive, total: top.total,
    vs: top.target ?? null, notes: top.notes, kos, koShare: Math.min(1, koThreat / attackThreat),
  };
}

// Monta as opções de pacote (sem e com energia habilitadora) para a tech
export function buildOptions(card, me, opp, db) {
  const opts = [];
  const base = new Set(me.energyTypes);
  const variants = [{ energy: null, types: base }];
  const miss = card.category === 'Pokemon' ? missingEnergy(card, me) : null;
  if (miss) variants.push({ energy: miss, types: new Set([...base, miss.type]) });
  for (const v of variants) {
    const adds = [];
    const prevo = card.stage && card.stage !== 'Basic' && !me.names.has(card.evolveFrom) ? bestPrevo(card, me, v.types, db) : null;
    // Estágio 2: a linha inteira (Básico → Estágio 1 → Estágio 2)
    const basePrevo = prevo?.card.evolveFrom && !me.names.has(prevo.card.evolveFrom) ? bestPrevo(prevo.card, me, v.types, db) : null;
    if (basePrevo) adds.push({ qty: 1, card: basePrevo.card, role: 'Básico da linha', notes: basePrevo.notes });
    if (prevo) adds.push({ qty: 1, card: prevo.card, role: 'pré-evolução', notes: prevo.notes });
    adds.push({ qty: 1, card, role: 'tech' });
    const energyCard = v.energy ? db.byName.get(`${v.energy.type.toLowerCase()} energy`)?.[0] : null;
    if (v.energy) adds.push({ qty: v.energy.qty, card: energyCard, role: 'energia habilitadora' });
    // Outras cartas do deck que a energia nova destrava
    const unlocks = [];
    if (v.energy) {
      for (const e of me.entries) {
        if (e.card.category !== 'Pokemon' || e.card.name === card.name) continue;
        const was = (e.card.attacks ?? []).some((a) => attackDamage(a) && canPay(a.cost, base));
        const now = (e.card.attacks ?? []).find((a) => attackDamage(a) && canPay(a.cost, v.types));
        if (!was && now) unlocks.push({ name: e.card.name, attack: now.name, damage: attackDamage(now), effect: now.effect });
      }
    }
    const combo = card.category === 'Pokemon' ? findCombos(card, me, v.types) : { combos: [], boost: 0, passive: 0 };
    const dmg = card.category === 'Pokemon' ? realDamage(card, me, opp, v.types, combo) : null;
    opts.push({ energy: v.energy, energyTypes: v.types, adds, slots: adds.reduce((s, a) => s + a.qty, 0), unlocks, combos: combo.combos, damage: dmg });
  }
  return opts;
}
