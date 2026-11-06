// Avalia se uma tech card cabe no deck do jogador, em 4 critérios:
//   recursos  — tenho energia, pré-evolução, busca e as peças que ela exige?
//   peso      — quantos slots custa? precisa trocar ACE SPEC?
//   sinergia  — conversa com o plano do deck (tipo, trocas, fonte de dano)?
//   risco     — o que passa pela muralha nocauteia ela? prêmios entregues? Boss contorna?
import { attackDamage, matches, typePt, parseSelector, extractTags } from './tags.js';

const ENERGY_PT = { Grass: 'Planta', Fire: 'Fogo', Water: 'Água', Lightning: 'Elétrica', Psychic: 'Psíquica', Fighting: 'Lutadora', Darkness: 'Escuridão', Metal: 'Metálica' };
const STATUS_PT = { confused: 'Confuso', poisoned: 'Envenenado', burned: 'Queimado', asleep: 'Adormecido', paralyzed: 'Paralisado' };
function effectPt(effect) {
  const m = (effect ?? '').match(/opponent.s active pok[eé]mon is now (\w+)/i);
  return m ? `deixa o Ativo do oponente ${STATUS_PT[m[1].toLowerCase()] ?? m[1]}` : '';
}

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const fmt = (n) => Math.round(n);

export function canPayCost(cost, me) {
  return (cost ?? []).every((t) => t === 'Colorless' || me.energyTypes.has(t));
}

// Quantas vezes um "for each" costuma contar, no contexto do deck que ataca
export function multiplier(effect, deck, defenderBench = 5) {
  const maxInPlay = deck.bigBench ? 9 : 6;
  if (/for each of your basic pok[eé]mon in play/i.test(effect)) return Math.min(maxInPlay, deck.counts.basic);
  if (/for each benched pok[eé]mon \(both|for each benched pok[eé]mon .both/i.test(effect)) return maxInPlay - 1 + defenderBench;
  if (/for each of your benched pok[eé]mon/i.test(effect)) return maxInPlay - 1;
  if (/for each of your pok[eé]mon in play/i.test(effect)) return maxInPlay;
  if (/for each of your opponent.s benched/i.test(effect)) return defenderBench;
  if (/for each prize card/i.test(effect)) return 4;
  if (/for each energy attached to both active/i.test(effect)) return 5; // ~3 dele + ~2 do seu Ativo
  if (/for each energy|for each .*energy attached/i.test(effect)) return 4;
  if (/flip a coin until you get tails/i.test(effect)) return 1; // valor esperado ~1
  if (/for each heads/i.test(effect)) return 1.5;
  if (/for each damage counter/i.test(effect)) return 8;
  return 3;
}

// Dano realista (perto do teto) de um ataque, considerando o deck que ataca
export function potentialDamage(attack, deck) {
  const d = String(attack.damage ?? '');
  const n = parseInt(d, 10) || 0;
  const eff = attack.effect ?? '';
  if (/[×x]$/.test(d)) return n * multiplier(eff, deck);
  if (d.endsWith('+')) {
    const more = +(eff.match(/(\d+) more damage/i)?.[1] ?? 50);
    return n + (/for each/i.test(eff) ? more * multiplier(eff, deck) : more);
  }
  return attackDamage(attack);
}

// Maior dano que os atacantes listados conseguem causar em "target"
function worstHit(target, attackers, opp) {
  let worst = { dmg: 0, by: null, note: '' };
  const boosts = opp.tagsByCard.flatMap(({ tags }) => tags.filter((t) => t.kind === 'EXTRA_DMG' && !t.onlyFor && matches(t.sel, target)).map((t) => t.amount));
  const boost = Math.max(0, ...boosts);
  for (const e of attackers) {
    if (e.feas !== undefined && e.feas < 0.3) continue; // não consegue energizar esse ataque
    for (const a of e.card.attacks ?? []) {
      let dmg = potentialDamage(a, opp);
      if (!dmg) continue;
      const weak = (target.weaknesses ?? []).some((w) => (e.card.types ?? []).includes(w.type));
      const res = (target.resistances ?? []).some((r) => (e.card.types ?? []).includes(r.type));
      dmg = (dmg + boost) * (weak ? 2 : 1) - (res ? 30 : 0);
      if (dmg > worst.dmg) worst = { dmg, by: e.card.name, attack: a.name, note: weak ? ' (fraqueza ×2)' : '' };
    }
  }
  return worst;
}

// Cartas do meu deck que só funcionam com Pokémon de um tipo (ex.: "Benched {D} Pokémon")
function typeTieIns(me) {
  const out = {};
  for (const { entry } of me.tagsByCard) {
    const m = [...entry.card.text.matchAll(/\{([GRWLPFDMN])\} pok[eé]mon/gi)].map((x) => x[1]);
    for (const sym of new Set(m)) (out[sym] ??= []).push(entry.card.name);
  }
  return out;
}
const SYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Dragon: 'N' };

export function evaluateFit(card, used, reasons, meBase, opp, db, opt = null) {
  const me = opt ? { ...meBase, energyTypes: opt.energyTypes } : meBase;
  const notes = { recursos: [], peso: [], sinergia: [], risco: [] };
  const f = { recursos: 1, peso: 1, sinergia: 1, risco: 1 };
  let slots = 1;
  const add = (k, factor, text) => { f[k] *= factor; if (text) notes[k].push(text); };
  const isWall = used.some((t) => t.kind === 'WALL_SELF');
  const prevo = opt?.adds?.find((a) => a.role === 'pré-evolução')?.card ?? (card.evolveFrom ? db.byName.get(card.evolveFrom.toLowerCase())?.[0] : null);

  // ---------- RECURSOS ----------
  if (card.category === 'Pokemon') {
    const attackTags = used.filter((t) => t.source === 'attack');
    const canAttack = (card.attacks ?? []).some((a) => attackDamage(a) > 0 && canPayCost(a.cost, me));
    if (attackTags.length && !attackTags.every((t) => canPayCost(t.cost, me))) {
      const need = [...new Set(attackTags.flatMap((t) => t.cost ?? []).filter((x) => x !== 'Colorless'))].map(typePt);
      add('recursos', 0.25, `✗ O efeito vem de um ataque que precisa de energia ${need.join('/')} — seu deck não tem.`);
    } else if (canAttack) { if (!opt?.energy) add('recursos', 1, '✓ Consegue atacar com as energias do seu deck.'); }
    else {
      const need = [...new Set((card.attacks ?? []).flatMap((a) => a.cost ?? []).filter((x) => x !== 'Colorless'))].map(typePt);
      add('recursos', 0.9, `⚠ Não ataca com as suas energias${need.length ? ` (precisa de ${need.join('/')})` : ''}.`);
    }
    // Energia fora do tipo: o custo é ACHAR a cópia única a tempo (energia ligada fica no Pokémon)
    if (opt?.energy) {
      const recur = meBase.entries.find((e) => /basic energy card from your discard pile|search your deck for [^.]*basic energy/i.test(e.card.text));
      add('recursos', recur ? 0.92 : 0.85, null);
    }
    if (opt?.energy) {
      add('recursos', 1, `✓ Com +${opt.energy.qty} Energia ${ENERGY_PT[opt.energy.type] ?? typePt(opt.energy.type)} no deck ela ataca ("${opt.energy.attack.name}").`);
      const recur = meBase.entries.find((e) => /basic energy card from your discard pile/i.test(e.card.text));
      notes.recursos.push(recur ? `• Só ${opt.energy.qty} cópia: dá para recuperar com ${recur.card.name}.` : `⚠ Só ${opt.energy.qty} cópia da energia no deck.`);
    }
    if (card.stage !== 'Basic') {
      if (!prevo) add('recursos', 0.1, `✗ A pré-evolução (${card.evolveFrom}) não está legal no Standard.`);
      else if (me.names.has(prevo.name)) add('recursos', 1, `✓ Você já joga ${prevo.name}.`);
    }
    // Busca: a carta em si e a pré-evolução
    const reach = (c) => {
      const w = [];
      if (!c) return w;
      if (me.search.any) w.push('Ultra Ball');
      if (me.search.nonRuleBox && !c.isRuleBox) w.push('Poké Pad');
      if (me.search.basicLowHp && c.stage === 'Basic' && c.hp <= 70) w.push('Buddy-Buddy Poffin');
      if ((me.search.basic && c.stage === 'Basic') || (me.search.evolution && c.stage !== 'Basic')) w.push("Brock's Scouting/busca");
      return w;
    };
    const wCard = reach(card);
    if (prevo) {
      const wPrevo = reach(prevo);
      add('recursos', wPrevo.length >= 2 ? 1 : 0.9, `${wPrevo.length >= 2 ? '✓' : '⚠'} ${prevo.name} (${prevo.hp} HP) sai com: ${wPrevo.join(', ') || 'nada'}.`);
    }
    add('recursos', wCard.length >= 2 ? 1 : wCard.length ? 0.92 : 0.8, `${wCard.length >= 2 ? '✓' : '⚠'} ${card.name} sai com: ${wCard.join(', ') || 'nenhuma busca'}.`);
  }
  // Requisitos escritos na carta ("only if you have any X in play")
  const req = card.text.match(/only if you have (?:any )?(.+?) in play/i);
  if (req) {
    const sel = parseSelector(req[1]);
    const ok = me.entries.some((e) => matches(sel, e.card));
    add('recursos', ok ? 1 : 0.1, ok ? `✓ Requisito atendido: ${req[1]}.` : `✗ Exige ${req[1]} em jogo — seu deck não tem.`);
  }
  if (card.trainerType && me.search.trainer) notes.recursos.push("✓ Buscável com Team Rocket's Petrel.");

  // Tempo de energização: quantas ligações para o ataque que dá o valor (1 ligação manual por turno)
  if (card.category === 'Pokemon') {
    const valueAtk = (card.attacks ?? []).filter((a) => attackDamage(a) > 0 || used.some((t) => t.source === 'attack' && t.name === a.name))
      .filter((a) => canPayCost(a.cost, me)).sort((a, b) => attackDamage(b) - attackDamage(a))[0];
    const attackMatters = used.some((t) => t.source === 'attack') || reasons.some((r) => ['WEAKNESS', 'COMBO_DMG', 'BENCH_PUNISH', 'PRIZE_RACE'].includes(r.kind));
    if (valueAtk && attackMatters) {
      const n = (valueAtk.cost ?? []).length;
      // aceleração do deck que serve para esta carta (ex.: Toxtricity liga {D} em Pokémon {D})
      const SYMK = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal' };
      const accel = meBase.entries.find((e) => (e.card.abilities ?? []).some((a) => {
        const m = (a.effect ?? '').match(/attach it to 1 of your benched \{([A-Z])\} pok[eé]mon/i);
        return m && (card.types ?? []).includes(SYMK[m[1]]);
      }));
      const turns = Math.max(1, Math.ceil(n / (accel ? 2 : 1)));
      let f2 = { 1: 1, 2: 0.9, 3: 0.68 }[turns] ?? 0.5;
      // Se o valor principal é uma habilidade (funciona sem energia), o ataque é bônus: pesa pela metade
      if (used.some((t) => t.source === 'ability') && reasons[0] && !['WEAKNESS', 'COMBO_DMG'].includes(reasons[0].kind)) f2 = (1 + f2) / 2;
      add('peso', f2, `${turns >= 3 ? '✗' : turns === 2 ? '⚠' : '✓'} "${valueAtk.name}" custa ${n} energia${n > 1 ? 's' : ''}: ~${turns} turno${turns > 1 ? 's' : ''} para energizar${accel ? ` (com ajuda do ${accel.card.name})` : ''}.`);
    }
  }
  // Espaço no banco: o plano do deck já ocupa as vagas?
  if (card.category === 'Pokemon' && meBase.board) {
    const b = meBase.board;
    const list = `${b.pieces.join(', ')}${b.backup ? ` + ${b.backup} de reserva` : ''}`;
    if (b.benchNeeded >= 5) add('peso', 0.72, `✗ Seu banco já fica cheio (${list}) — ${card.name}${card.stage !== 'Basic' ? ` e a pré-evolução` : ''} disputam vaga.`);
    else if (b.benchNeeded >= 4) add('peso', 0.88, `⚠ Banco quase cheio (${list}).`);
  }
  // ---------- PESO ----------
  let effSlots = null;
  if (opt) {
    slots = opt.slots;
    // Energia habilitadora que também destrava outras cartas suas conta como meio slot
    if (opt.energy && opt.unlocks?.length) effSlots = slots - 0.5;
  }
  else if (card.stage === 'Stage1') slots = me.names.has(card.evolveFrom) ? 1 : 2;
  else if (card.stage === 'Stage2') slots = me.search.rareCandy ? 2 : 3;
  const PESO = { 1: 1, 2: 0.86, 3: 0.74, 4: 0.62 };
  if (card.stage === 'Stage2' && !me.search.rareCandy) add('peso', 0.85, '• Estágio 2 sem Rare Candy: lento.');
  const pesoOf = (n) => (Number.isInteger(n) ? PESO[n] ?? 0.5 : ((PESO[Math.floor(n)] ?? 0.5) + (PESO[Math.ceil(n)] ?? 0.5)) / 2);
  if (effSlots) notes.peso.push(`✓ A energia nova é dividida com ${opt.unlocks.map((u) => u.name).join(', ')} — conta como meio slot.`);
  add('peso', pesoOf(effSlots ?? slots), slots === 1 ? '✓ Custa só 1 slot.' : `• Pacote de ${slots} cartas: ${opt ? opt.adds.map((a) => `${a.qty}x ${a.card?.name}`).join(' + ') : card.name}.`);
  if (card.aceSpec && me.aceSpec) add('peso', 0.6, `⚠ É ACE SPEC: precisa sair o seu ${me.aceSpec.name}.`);
  if (card.trainerType === 'Supporter') add('peso', 0.9, '• É Supporter: compete com Lillie\'s, Boss etc. pelo turno.');
  if (card.trainerType === 'Stadium' && me.counts.stadium) notes.peso.push(`• Você já joga ${me.counts.stadium} Estádio(s) — pode trocar 1 deles.`);

  // ---------- SINERGIA ----------
  if (opt?.combos?.length) {
    add('sinergia', clamp(0.8 + 0.07 * opt.combos.length), null);
    for (const c of opt.combos) notes.sinergia.push(`✓ ${c.text}`);
  }
  if (opt?.unlocks?.length) for (const u of opt.unlocks) notes.sinergia.push(`✓ Bônus: a energia nova também libera "${u.attack}" do seu ${u.name} (${u.damage} de dano${effectPt(u.effect) ? ' + ' + effectPt(u.effect) : ''}).`);
  for (const a of opt?.adds ?? []) if (a.role === 'pré-evolução') for (const n of a.notes ?? []) notes.sinergia.push(`✓ ${a.card.name} (${a.card.setCode} ${parseInt(a.card.localId, 10)}): ${n}.`);
  if (card.category === 'Pokemon' && !opt?.combos?.length) {
    const tie = typeTieIns(me);
    const mainSym = SYM[me.mainAttacker?.types?.[0]];
    const tied = mainSym ? [...new Set(tie[mainSym] ?? [])] : [];
    const mySym = (card.types ?? []).map((t) => SYM[t]);
    if (tied.length) {
      if (mySym.includes(mainSym)) add('sinergia', 1.08, `✓ É do tipo ${typePt(me.mainAttacker.types[0])}: funciona com ${tied.join(', ')}.`);
      else add('sinergia', 0.85, `⚠ Não é do tipo ${typePt(me.mainAttacker.types[0])}: não aproveita ${tied.join(', ')}.`);
    }
  }
  if (card.category === 'Pokemon' && isWall) {
    {
      const mySym = (card.types ?? []).map((t) => SYM[t]);
      const canAttack = (card.attacks ?? []).some((a) => attackDamage(a) > 0 && canPayCost(a.cost, me));
      const passive = me.entries.filter((e) => e.card.abilities?.some((a) => /damage counters?/i.test(a.effect ?? '') && /opponent.s pok[eé]mon/i.test(a.effect ?? '')));
      const wallByAttack = used.find((t) => t.kind === 'WALL_SELF' && t.source === 'attack');
      const wallAtk = wallByAttack && (card.attacks ?? []).find((a) => a.name === wallByAttack.name);
      if (wallAtk && attackDamage(wallAtk) < 60 && !(opt?.damage?.kos?.length)) add('sinergia', 0.6, `✗ "${wallAtk.name}" segura 1 turno, mas bate só ${attackDamage(wallAtk)} — não avança na corrida de prêmios.`);
      else if (canAttack) add('sinergia', 1, '✓ Segura o dano E ataca de volta.');
      else if (passive.length) add('sinergia', 0.9, `✓ Não ataca, mas ${passive.map((e) => e.card.name).join(', ')} continua causando dano enquanto ela segura.`);
      else add('sinergia', 0.55, '✗ Segura o dano mas não causa dano — o oponente pode só esperar ou usar Boss.');
      // Como ela chega no Ativo / sai de lá
      const switchers = me.entries.filter((e) => /switch (1 of )?your (benched|active)|switch your active|switch .* with your active/i.test(e.card.text));
      if (!opt?.combos?.length) {
      const usable = switchers.filter((e) => { const m = e.card.text.match(/benched \{([A-Z])\} pok[eé]mon/i); return !m || mySym.includes(m[1]); });
      if (usable.length) add('sinergia', 1, `✓ ${usable.map((e) => e.card.name).join(', ')} coloca ela no Ativo na hora certa.`);
      else if ((card.retreat ?? 0) >= 3) add('sinergia', 0.85, `⚠ Recuo ${card.retreat} e nenhuma carta de troca que funcione com ela.`);
      else notes.sinergia.push(`• Recuo ${card.retreat ?? 0}; entra no Ativo quando outro Pokémon cair.`);
      }
    }
  }
  // Já tenho algo que faz o mesmo papel?
  const mainKind = reasons[0]?.kind;
  const same = me.tagsByCard.filter(({ tags }) => tags.some((t) => t.kind === mainKind && t.kind !== 'STADIUM_REPLACE' && t.kind !== 'WEAKNESS'));
  if (same.length) add('sinergia', 0.6, `⚠ Você já tem ${same.map((x) => x.entry.card.name).join(', ')} com papel parecido.`);

  // ---------- RISCO ----------
  if (card.category === 'Pokemon') {
    if (isWall) {
      const wall = used.find((t) => t.kind === 'WALL_SELF');
      const through = opp.threat.filter((e) => (e.card.attacks ?? []).length && e.feas >= 0.3 && !matches(wall.sel, e.card));
      const w = worstHit(card, through, opp);
      if (!through.length) add('risco', 1, '✓ Nenhum atacante do oponente passa pela muralha.');
      else if (w.dmg >= card.hp) add('risco', 0.4, `✗ ${w.by} passa pela muralha e causa até ~${fmt(w.dmg)}${w.note} com "${w.attack}" — nocauteia ${card.name} (${card.hp} HP) de uma vez.`);
      else if (w.dmg * 2 >= card.hp) add('risco', 0.85, `⚠ ${w.by} passa pela muralha (~${fmt(w.dmg)}${w.note}): derruba ${card.name} em 2 ataques.`);
      else add('risco', 1, `✓ O que passa pela muralha (${w.by ?? '—'}, ~${fmt(w.dmg)}) não ameaça os ${card.hp} HP.`);
      const gust = opp.entries.filter((e) => /switch in 1 of your opponent.s benched/i.test(e.card.text)).reduce((s, e) => s + e.count, 0);
      if (gust) add('risco', clamp(1 - gust * 0.04, 0.8), `• O oponente tem ${gust} carta(s) tipo Boss's Orders para contornar a muralha.`);
    } else {
      const w = worstHit(card, opp.threat, opp);
      if (w.dmg >= card.hp) add('risco', 0.9, `• Cai em 1 ataque para ${w.by} (~${fmt(w.dmg)}).`);
    }
    if (card.isMega) add('risco', 0.75, '⚠ Mega ex: entrega 3 prêmios.');
    else if (card.isEx) add('risco', 0.88, '⚠ Pokémon ex: entrega 2 prêmios.');
    else notes.risco.push('✓ Sem Rule Box: entrega só 1 prêmio.');
  }

  for (const k of Object.keys(f)) f[k] = clamp(f[k]);
  const factor = f.recursos * f.peso * f.sinergia * f.risco;
  return { factor, parts: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 100)])), notes, slots };
}

// Cartas do meu deck que não fazem nada NESTE matchup
export function deadInMatchup(card, me, opp) {
  if (/stage 2/i.test(card.text) && !opp.counts.stage2 && !me.counts.stage2 && card.category === 'Trainer') return 'só afeta Pokémon Estágio 2 — nenhum dos dois decks tem';
  if (/tera pok/i.test(card.text) && !opp.counts.tera && !me.counts.tera) return 'só afeta Pokémon Tera — ninguém tem';
  for (const t of extractTags(card)) {
    if (t.sel && ['EXTRA_DMG', 'WALL_SELF', 'REDUCE'].includes(t.kind) && !opp.threat.some((e) => matches(t.sel, e.card))) return `o efeito não atinge nenhum Pokémon do oponente`;
  }
  return null;
}
