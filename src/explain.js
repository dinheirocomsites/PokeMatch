// "Como entendemos o seu deck": o que o motor concluiu sobre a mecânica de cada lista, em português, para o
// jogador conferir ANTES de ver as sugestões (tela de espera). Só descreve o que o motor de fato usa nas contas.
import { damageVs } from './damage.js';
import { attackDamage } from './tags.js';
import { spreadOf } from './prizes.js';

const SYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Dragon: 'N', Colorless: 'C' };
const TYPE_PT = { Grass: 'Planta', Fire: 'Fogo', Water: 'Água', Lightning: 'Elétrico', Psychic: 'Psíquico', Fighting: 'Lutador', Darkness: 'Escuridão', Metal: 'Metal', Dragon: 'Dragão', Colorless: 'Incolor' };
const cost = (c) => (c ?? []).map((x) => `{${SYM[x] ?? x[0]}}`).join('') || 'sem custo';
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const pokemon = (p) => p.entries.filter((e) => e.card.category === 'Pokemon');
const abilityTxt = (c) => (c.abilities ?? []).map((a) => `${a.name} ${a.effect ?? ''}`).join(' ');
const allTxt = (c) => `${abilityTxt(c)} ${(c.attacks ?? []).map((a) => a.effect ?? '').join(' ')} ${c.effect ?? ''}`;
const SELF_HURT = /place \d+ damage counters on that pok[eé]mon|also does \d+ damage to itself|damage to 1 of your benched/i;

// Valor de um ataque para listar: dano × alvos (Trifrost: 110 em 3 Pokémon)
const anyOne = (a) => +((a.effect ?? '').match(/(\d+) damage to 1 of your opponent.s pok[eé]mon/i)?.[1] ?? 0); // Cruel Arrow
const atkValue = (a) => {
  const sp = spreadOf(a), base = (a.damage ? attackDamage(a) : 0) || anyOne(a);
  if (!sp) return base || attackDamage(a);
  if (sp.withActive) return sp.amount * (sp.count + 1);
  if (sp.mode === 'each') return base + sp.amount * 3;
  if (sp.mode === 'distribute') return base + sp.amount;
  return base + sp.amount * (sp.count ?? 1);
};
const dmgLabel = (a) => {
  const sp = spreadOf(a), base = a.damage ? String(a.damage) : '';
  if (!sp) return base || (anyOne(a) ? `${anyOne(a)} em qualquer Pokémon dele` : 'efeito');
  if (sp.withActive) return `${sp.amount} em ${sp.count + 1} Pokémon`;
  if (sp.mode === 'each') return `${base ? `${base} + ` : ''}${sp.amount} em cada um do banco`;
  if (sp.mode === 'distribute') return `${base ? `${base} + ` : ''}${sp.amount} espalhados no banco`;
  return `${base ? `${base} + ` : ''}${sp.amount} em ${sp.count} Pokémon${sp.exOnly ? ' ex' : ''} do banco`;
};

// Melhor ataque de um Pokémon contra um alvo (com o que o deck dele monta)
function bestHit(card, deck, target, defDeck, selfDamaged) {
  let best = null;
  for (const a of card.attacks ?? []) {
    const r = damageVs(a, card, target, { deck, defDeck, oppTaken: 3, selfDamaged, ...(deck.pressure ?? {}) });
    if (!best || r.dmg > best.dmg) best = { atk: a, ...r };
  }
  return best;
}

function attackersOf(p, main) {
  return p.threat
    .filter((e) => e.card !== main && e.feas >= 0.3 && !e.stepping && e.threat > 0 && (e.card.attacks ?? []).some((a) => attackDamage(a) || /for each|damage to 1 of/i.test(a.effect ?? '')))
    .sort((a, b) => b.threat - a.threat).slice(0, 3).map((e) => e.card);
}

// Uma lista: atacante principal + conta do dano, quem habilita o bônus, peças do banco, energia, outros atacantes, cópias
export function explainSide(p, other, { koGap = null, mine = true } = {}) {
  const out = [];
  const main = p.mainAttacker;
  const selfHurt = p.entries.filter((e) => SELF_HURT.test(allTxt(e.card))).map((e) => {
    const b = [...(e.card.abilities ?? []), ...(e.card.attacks ?? [])].find((x) => SELF_HURT.test(x.effect ?? ''));
    return b ? `${e.card.name} ("${b.name}")` : e.card.name;
  });
  const selfDamaged = selfHurt.length > 0;
  if (main) {
    const target = other.mainAttacker ?? pokemon(other)[0]?.card;
    const hit = target && bestHit(main, p, target, other, selfDamaged);
    const evo = main.evolveFrom ? ` (evolui de ${main.evolveFrom})` : '';
    let txt = `<b>${main.name}</b>${evo}, ${main.hp} HP`;
    if (hit?.atk) {
      txt += ` — ataca com "${hit.atk.name}" ${cost(hit.atk.cost)}${hit.atk.copiedFrom ? ` (copiado do ${hit.atk.copiedFrom})` : ''}: o motor conta <b>${Math.round(hit.dmg)}</b> de dano no ${target.name}`;
      const why = [];
      if (/if this pok[eé]mon has any damage counters/i.test(hit.atk.effect ?? '') && selfDamaged) why.push(`conta o bônus de "ter contador de dano": quem coloca dano nele é ${list(selfHurt)}`);
      if ((hit.notes ?? []).some((n) => n.startsWith('fraqueza'))) why.push('com fraqueza');
      if (why.length) txt += ` (${why.join('; ')})`;
      if (mine && koGap && koGap.attack === hit.atk.name && koGap.full > koGap.alone) {
        const poisoners = pokemon(p).filter((e) => /is now poisoned/i.test(allTxt(e.card))).map((e) => e.card.name);
        const pieces = (koGap.pieces ?? []).map((x) => `${x.name.replace(' (envenenado)', '')} +${x.amount}${/envenenado/.test(x.name) ? ` (com ele Envenenado${poisoners.length ? `: ${list(poisoners)}` : ''})` : ''}`);
        txt += `; com tudo montado chega a <b>${koGap.full}</b>: ${pieces.join(' + ')}`;
      }
      txt += '.';
    }
    out.push({ icon: '⚔️', label: mine ? 'Seu atacante principal' : 'Atacante principal dele', text: txt });
  }
  // Peças do banco (habilidades que funcionam fora do Ativo) e a reserva do atacante
  const pieces = (p.board?.pieces ?? []).map((n) => p.entries.find((e) => e.card.name === n)?.card).filter(Boolean);
  if (pieces.length) out.push({ icon: '🧩', label: 'Peças no banco', text: `${pieces.map((c) => `${c.name} ("${(c.abilities ?? [])[0]?.name ?? '?'}")`).join(', ')}${p.board?.backup ? ` + ${p.board.backup} de reserva` : ''}.` });
  // Energia e aceleração
  const en = Object.entries(p.energyByType ?? {}).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${TYPE_PT[t] ?? t}`);
  const special = p.entries.filter((e) => e.card.isSpecialEnergy).map((e) => `${e.count} ${e.card.name}`);
  const accel = pokemon(p).filter((e) => /search your deck for (a|up to \d+) basic .*energy cards? and attach|attach (a|up to \d+) basic .*energy/i.test(abilityTxt(e.card))).map((e) => e.card.name);
  out.push({ icon: '🔋', label: 'Energia', text: `${en.length ? en.join(' + ') : 'nenhuma'}${special.length ? ` (especiais: ${special.join(', ')})` : ''}${accel.length ? `; acelera energia com ${list(accel)}` : ''}.` });
  // Outros atacantes
  const others = attackersOf(p, main);
  if (others.length) out.push({ icon: '🗡️', label: 'Outros que atacam', text: others.map((c) => { const a = [...(c.attacks ?? [])].sort((x, y) => atkValue(y) - atkValue(x))[0]; return `${c.name} ("${a.name}" ${cost(a.cost)} ${dmgLabel(a)})`; }).join(', ') + '.' });
  // Ataques copiados (Slowking + Academy at Night: "Trifrost" do Kyurem)
  const copied = pokemon(p).flatMap((e) => (e.card.attacks ?? []).filter((a) => a.copiedFrom).map((a) => ({ v: atkValue(a), t: `${e.card.name} usa "${a.copiedAttack ?? a.name}" do ${a.copiedFrom} pagando ${cost(a.cost)} (${dmgLabel(a)})` })));
  const shown = [...new Map(copied.sort((x, y) => y.v - x.v).map((x) => [x.t, x])).values()].slice(0, 3).map((x) => x.t);
  if (shown.length) out.push({ icon: '🪞', label: 'Ataques copiados', text: shown.join('; ') + '.' });
  return out;
}

export function explainDeck(me, opp, { koGap = null, raceResult = null, archetype = null } = {}) {
  return {
    mine: explainSide(me, opp, { koGap, mine: true }),
    theirs: explainSide(opp, me, { mine: false }),
    archetype,
    race: raceResult,
  };
}
