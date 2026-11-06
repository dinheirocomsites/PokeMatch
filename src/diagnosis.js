// Diagnóstico por EIXOS: em vez de procurar um único tipo de problema ("quem mata meu atacante"),
// mede cada coisa que o plano do oponente faz contra o SEU deck e quanto isso machuca.
// Cada eixo traz evidências e os tipos de carta que respondem a ele.
import { extractTags, matches, parseSelector, TERA, ANCIENT, isFuture, ownerRefs, OWNER_PT } from './tags.js';
import { damageVs } from './damage.js';

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
  pokemon_lock: { label: 'Trava de Pokémon com Habilidade vindos da mão', counters: [] }, // resposta: tirar o Pokémon do Ativo (Boss) ou nocautear
  speed: { label: 'Pressão cedo (ele bate forte no 1º/2º turno)', counters: ['STARTER'] },
  heal_stall: { label: 'Cura / stall', counters: ['HEAL_BLOCK'] }, // dano extra para nocautear em 1 ataque: tratado no motor
  mill: { label: 'Moinho (descarta o topo do seu deck)', counters: ['DECK_RECOVERY'] },
  status_lock: { label: 'Paralisia / sono no seu Ativo', counters: ['SWITCH', 'STATUS_CURE'] },
  comeback: { label: 'Virada (cartas que ficam fortes quando ele está atrás)', counters: [] },
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

  // 7) Trava de Pokémon com Habilidade vindos da mão (Team Rocket's Arbok, no Ativo)
  const pLock = oppTags.filter((t) => t.kind === 'HAND_PKMN_LOCK');
  if (pLock.length) {
    const hit = me.entries.filter((e) => e.card.category === 'Pokemon' && e.card.abilities?.length && (!pLock[0].exceptOwner || e.card.owner !== pLock[0].exceptOwner));
    const copies = hit.reduce((s2, e) => s2 + e.count, 0);
    if (copies >= 3) {
      axes.push({ key: 'pokemon_lock', severity: clamp(copies / 10), evidence: `${list(pLock.map((t) => t.card.name))} (enquanto estiver Ativo) impede você de jogar da mão — nem no banco, nem evoluindo — Pokémon com Habilidade: ${list(hit.map((e) => e.card.name), 5)} (${copies} cartas).` });
      const gust = me.entries.filter((e) => /switch in 1 of your opponent.s benched/i.test(e.card.text)).map((e) => e.card.name);
      tips.push(`A trava do ${pLock[0].card.name} só vale com ele no Ativo: ${gust.length ? `${list(gust, 2)} puxa outro Pokémon e manda ele para o banco` : 'nocauteie ou force a troca dele'}; antes disso, baixe os Pokémon com Habilidade que puder no turno anterior.`);
    }
  }

  // 8) Pressão cedo: atacantes dele que batem forte com até 2 energias (1º/2º turno) nos seus Básicos de setup
  const setupNames = new Set([...(me.board?.pieces ?? []), me.board?.backup].filter(Boolean));
  const basicOfLine = (c) => { let x = c; for (let i = 0; i < 2 && x?.evolveFrom; i++) x = me.entries.find((e) => e.card.name === x.evolveFrom)?.card; return x; };
  if (me.mainAttacker) { const b = basicOfLine(me.mainAttacker); if (b) setupNames.add(b.name); }
  const setup = me.entries.filter((e) => e.card.category === 'Pokemon' && e.card.stage === 'Basic' && (setupNames.has(e.card.name) || me.entries.some((x) => x.card.evolveFrom === e.card.name && setupNames.has(x.card.name))));
  const fast = opp.threat.filter((e) => ['Basic', 'Stage1'].includes(e.card.stage) && e.feas >= 0.3);
  if (setup.length && fast.length) {
    // No começo do jogo o tabuleiro está vazio: ataque variável conta só o dano base (sem "por Pokémon no banco")
    const early = (a) => (/[×+]$/.test(String(a.damage ?? '')) ? { ...a, damage: String(parseInt(a.damage, 10) || 0), effect: '' } : a);
    const kos = [];
    let maxDmg = 0;
    for (const s2 of setup) {
      let best = { dmg: 0, w: 0 };
      for (const f of fast) for (const a of f.card.attacks ?? []) {
        const cost = (a.cost ?? []).length;
        if (cost > 2) continue;
        const r = damageVs(early(a), f.card, s2.card, { deck: opp, oppTaken: 0 });
        // peso do tempo: 1 energia = já no 1º turno dele; 2 energias = 2º turno; Estágio 1 = 2º turno
        const w = (cost <= 1 ? 1 : 0.5) * (f.card.stage === 'Basic' ? 1 : 0.6);
        if (r.dmg >= s2.card.hp && w > best.w) best = { dmg: r.dmg, w, by: f.card.name, cost };
        if (r.dmg > maxDmg) maxDmg = r.dmg;
      }
      if (best.w) kos.push({ name: s2.card.name, hp: s2.card.hp, by: best.by, w: best.w, cost: best.cost, key: me.mainAttacker && basicOfLine(me.mainAttacker)?.name === s2.card.name });
    }
    const weight = kos.reduce((s2, k) => s2 + k.w * (k.key ? 2 : 1), 0) / (setup.length + 1);
    const sev = clamp(weight);
    if (kos.length && sev >= 0.25) {
      const bys = [...new Set(kos.map((k) => k.by))];
      const t1 = kos.filter((k) => k.cost <= 1 && k.w >= 1);
      axes.push({ key: 'speed', severity: sev, maxDmg, evidence: `${list(bys)} ${bys.length > 1 ? 'nocauteiam' : 'nocauteia'} seus Básicos de setup ${t1.length ? 'já no 1º turno dele (1 energia)' : 'no 2º turno dele (2 energias ou evolução)'}: ${list(kos.map((k) => `${k.name} (${k.hp} HP)`), 4)}.` });
      const key = kos.find((k) => k.key);
      tips.push(`Contra a pressão cedo: ${key ? `não deixe o ${key.name} sozinho — baixe 2 cópias no 1º turno para evoluir mesmo se uma cair; ` : ''}comece no Ativo com o Pokémon de mais HP que tiver e guarde os frágeis no banco.`);
    }
  }

  // 9) Cura / stall: só pesa quando o seu atacante precisa de 2 ataques no atacante dele
  const heals = oppTags.filter((t) => t.kind === 'HEAL' && t.source !== 'attack' && (t.amount ?? 0) >= 30);
  if (heals.length && me.mainAttacker && opp.mainAttacker) {
    const selfDamaged = me.entries.some((e) => /place \d+ damage counters on that pok[eé]mon|also does \d+ damage to itself|damage to 1 of your benched/i.test(e.card.text ?? ''));
    const mine = Math.max(0, ...(me.mainAttacker.attacks ?? []).map((a) => damageVs(a, me.mainAttacker, opp.mainAttacker, { deck: me, oppTaken: 3, selfDamaged, ...(me.pressure ?? {}) }).dmg));
    const twoHits = mine < opp.mainAttacker.hp;
    const copies = [...new Map(heals.map((t) => [t.card.name, t.count])).values()].reduce((s2, n) => s2 + n, 0);
    const sev = clamp(copies / 6) * (twoHits ? 1 : 0.25);
    if (sev >= 0.2) {
      axes.push({ key: 'heal_stall', severity: sev, evidence: `${list(heals.map((t) => `${t.card.name} (cura ${t.amount >= 999 ? 'tudo' : t.amount})`))}; o seu ${me.mainAttacker.name} faz ~${Math.round(mine)} no ${opp.mainAttacker.name} (${opp.mainAttacker.hp} HP)${twoHits ? ' — precisa de 2 ataques, e a cura apaga o primeiro' : ''}.` });
      if (twoHits) tips.push(`Contra a cura: o dano do 1º ataque some se ele curar. Junte o dano para nocautear em 1 ataque (veja a margem de nocaute) ou troque de alvo com Boss em vez de bater 2 vezes no mesmo Pokémon.`);
    }
  }

  // 10) Moinho: descarta o topo do seu deck
  let mill = 0;
  const millers = [];
  for (const e of opp.entries) for (const blk of [...(e.card.attacks ?? []), ...(e.card.abilities ?? [])]) {
    const m = (blk.effect ?? '').match(/discard the top (\d+|card)[^.]* of your opponent.s deck/i);
    if (!m) continue;
    const n = m[1] === 'card' ? 1 : +m[1];
    const w = /flip a coin/i.test(blk.effect) ? 0.5 : 1;
    mill += n * w * Math.min(e.count, 3) * (blk.cost ? 2 : 1); // ataque: repete por vários turnos
    millers.push(e.card.name);
  }
  if (mill >= 6) {
    axes.push({ key: 'mill', severity: clamp(mill / 25), evidence: `${list(millers)} descarta${millers.length > 1 ? 'm' : ''} o topo do seu deck (~${Math.round(mill)} cartas por jogo).` });
    tips.push(`Contra moinho: conte o seu deck; não use compra/busca além do necessário e guarde recuperação para o fim.`);
  }

  // 11) Paralisia / sono no seu Ativo
  let sl = 0;
  const sleepers = [];
  for (const e of opp.threat) for (const a of e.card.attacks ?? []) {
    if (!/(defending|opponent.s active) pok[eé]mon is now (?:[a-z]+ and )?(paralyzed|asleep)/i.test(a.effect ?? '') || e.feas < 0.3) continue;
    const coin = /flip a coin/i.test(a.effect ?? '');
    sl += Math.min(e.count, 3) * (coin ? 0.5 : 1);
    sleepers.push(`${e.card.name}${coin ? ' (moeda)' : ''}`);
  }
  if (sl >= 2) {
    axes.push({ key: 'status_lock', severity: clamp(sl / 6), evidence: `${list(sleepers)} paralisa/adormece o seu Ativo.` });
    tips.push(`Contra paralisia/sono: o efeito sai quando o Pokémon vai para o banco — guarde uma carta de troca para o turno seguinte.`);
  }

  // 12) Virada: cartas que dependem de ele estar atrás nos prêmios
  const comeback = opp.entries.filter((e) => /(only if|if) (you have more prize cards remaining than your opponent|your opponent has (exactly )?\d+ (or fewer )?prize cards? remaining)/i.test(e.card.text));
  const cbCopies = comeback.reduce((s2, e) => s2 + e.count, 0);
  if (cbCopies >= 2) {
    axes.push({ key: 'comeback', severity: clamp(cbCopies / 12), evidence: `${list(comeback.map((e) => `${e.card.name} (${e.count}x)`), 5)} ficam fortes quando ele está atrás / quando você chega a poucos prêmios.` });
    const briar = comeback.find((e) => /exactly 2 prize/i.test(e.card.text));
    tips.push(`Contra a virada: ${briar ? `não pare em 2 prêmios restantes (${briar.card.name} só funciona aí) — prefira ir de 3 para 1 ou fechar de uma vez; ` : ''}abrir vantagem cedo libera as cartas dele: planeje os últimos nocautes antes.`);
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
  if (/(shuffle|put) [^.]*from your discard pile into your deck/i.test(card.text ?? '')) out.push({ kind: 'DECK_RECOVERY', name: card.name });
  // Cura de condição que vale para o SEU atacante (não "este Pokémon não pode ser afetado", como os Fósseis Antigos)
  if (/recovers? from all special conditions|your pok[eé]mon[^.]*can.t be affected by (any )?special conditions|pok[eé]mon with [^.]*attached[^.]*can.t be affected by (any )?special conditions/i.test((card.text ?? '').replace(/this pok[eé]mon can.t be affected by (any )?special conditions/gi, ''))) out.push({ kind: 'STATUS_CURE', name: card.name });
  if (/can.t be healed/i.test(card.text ?? '')) out.push({ kind: 'HEAL_BLOCK', name: card.name });
  // Bom Pokémon inicial: Básico sem Rule Box, HP alto e recuo barato (aguenta o ataque cedo)
  if (card.category === 'Pokemon' && card.stage === 'Basic' && !card.isRuleBox && (card.retreat ?? 9) <= 1 && card.hp >= 100) out.push({ kind: 'STARTER', name: card.name, hp: card.hp });
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
// Pokémon de Treinador ("N's Zoroark ex", "Team Rocket's Mewtwo ex", "Hop's Snorlax"): cartas que só funcionam
// com Pokémon do mesmo dono. Conta quantos o deck tem (sem contar a própria carta) e quantos cabem em jogo.
function ownerStock(me, owner, exclude) {
  const list = me.entries.filter((e) => e.card.category === 'Pokemon' && e.card.owner === owner && e.card.name !== exclude);
  return {
    copies: list.reduce((s, e) => s + e.count, 0),
    inPlay: list.filter((e) => e.card.stage === 'Basic').reduce((s, e) => s + Math.min(e.count, 2), 0), // linhas evoluídas contam pelo Básico
    names: [...new Set(list.map((e) => e.card.name))],
  };
}
function ownerRequirements(card, t, me, opp, notes, good) {
  const txt = t.replace(/[’]/g, "'");
  const PT = (o) => OWNER_PT[o] ?? o;
  let factor = 1;
  // 1) "Este Pokémon não pode atacar a menos que você tenha N ou mais Pokémon de X em jogo"
  const unless = txt.match(/can't attack unless you have (\d+) or more (Team Rocket|[A-Z][a-zA-Z.]*)'s pok[eé]mon in play/i);
  if (unless) {
    const need = +unless[1];
    const st = ownerStock(me, unless[2], card.name);
    const have = st.inPlay + (card.owner === unless[2] ? 1 : 0);
    if (have < need) return { ok: false, note: `só ataca com ${need}+ Pokémon de ${PT(unless[2])} em jogo — seu deck põe no máximo ${have} (${st.names.join(', ') || 'nenhum outro'})` };
    good.push(`ataca: seu deck põe ${have} Pokémon de ${PT(unless[2])} em jogo (precisa de ${need})`);
  }
  // 2) "Só pode ser ligada a um Pokémon de X" (Team Rocket's Energy)
  const onlyOn = txt.match(/can only be attached to an? (Team Rocket|[A-Z][a-zA-Z.]*)'s pok[eé]mon/i);
  if (onlyOn && !ownerStock(me, onlyOn[1], card.name).copies) return { ok: false, note: `só pode ser ligada em Pokémon de ${PT(onlyOn[1])} — seu deck não tem` };
  // 3) "Só pode usar esta carta se um Pokémon de X seu foi nocauteado" (Team Rocket's Archer)
  const onlyIf = txt.match(/use this card only if any of your (Team Rocket|[A-Z][a-zA-Z.]*)'s pok[eé]mon/i);
  if (onlyIf && !ownerStock(me, onlyIf[1], card.name).copies) return { ok: false, note: `só pode ser jogada depois de um Pokémon de ${PT(onlyIf[1])} seu ser nocauteado — seu deck não tem` };
  // 4) Demais referências, frase a frase
  const sentences = txt.split(/(?<=[.:])\s+/);
  const done = new Set([unless?.[2], onlyOn?.[1], onlyIf?.[1]].filter(Boolean));
  for (const s of sentences) {
    for (const o of ownerRefs(s)) {
      if (done.has(o)) continue;
      // Tarja de exceção do oponente ("except for Team Rocket's Pokémon") não é requisito seu
      if (new RegExp(`except for ${o}'s`, 'i').test(s) || new RegExp(`opponent's (?:benched |active )?${o}'s`, 'i').test(s)) continue;
      done.add(o);
      const st = ownerStock(me, o, card.name);
      // (o texto chega sem parênteses: "(both yours and your opponent's)" se perde, então olha o texto original)
      const both = /both yours and your opponent's|each player|their deck/i.test(s) || (card.trainerType === 'Stadium' && /both yours and your opponent's|each player/i.test(card.text ?? ''));
      const theirs = opp ? opp.entries.filter((e) => e.card.owner === o) : [];
      // a própria carta conta, menos quando o efeito exige OUTRO Pokémon no banco enquanto ela ataca (Night Joker)
      const norm = (x) => (x ?? '').replace(/\([^)]*\)/g, ' ').replace(/[’]/g, "'");
      const part = [...(card.abilities ?? []), ...(card.attacks ?? [])].find((a) => norm(a.effect).includes(s.slice(0, 30)));
      const selfCounts = card.owner === o && !(/benched/i.test(s) && (card.attacks ?? []).includes(part));
      const mine = st.copies + (selfCounts ? 1 : 0);
      if (both) {
        if (!st.copies && theirs.length) { factor *= 0.3; notes.push(`o efeito ajuda só o oponente: ele joga Pokémon de ${PT(o)} (${[...new Set(theirs.map((e) => e.card.name))].slice(0, 3).join(', ')})`); }
        else if (!st.copies) { factor *= 0.6; notes.push(`o efeito só vale para Pokémon de ${PT(o)} — nenhum dos dois decks tem`); }
        else if (theirs.length) { factor *= 0.85; notes.push(`também ajuda os Pokémon de ${PT(o)} do oponente`); good.push(`ajuda seus Pokémon de ${PT(o)} (${st.names.slice(0, 3).join(', ')})`); }
        else good.push(`ajuda seus Pokémon de ${PT(o)} (${st.names.slice(0, 3).join(', ')})`);
        continue;
      }
      if (mine) { if (st.copies) good.push(`combina com seus Pokémon de ${PT(o)} (${st.names.slice(0, 3).join(', ')})`); if (st.copies && st.copies <= 2) { factor *= 0.9; notes.push(`só ${st.copies} Pokémon de ${PT(o)} na lista para aproveitar`); } continue; }
      // não tem nenhum Pokémon desse dono
      // "…instead": o efeito básico funciona, só o bônus depende do dono (Arven's Sandwich, Team Rocket's Ariana)
      if (/instead/i.test(s)) { factor *= 0.85; notes.push(`o bônus só vale com Pokémon de ${PT(o)} — seu deck não tem (fica o efeito básico)`); continue; }
      // o resto do efeito depende desta frase ("If you do, …": Team Rocket's Giovanni)
      const idx = sentences.indexOf(s);
      const chained = /^if you do/i.test(sentences[idx + 1] ?? '');
      const partial = !chained && (/in any combination of/i.test(s) || (card.category === 'Pokemon' && sentences.some((x) => !ownerRefs(x).length && /damage|draw|search|attach/i.test(x))));
      if (card.category === 'Trainer' && !partial && (chained || sentences.filter((x) => ownerRefs(x).length).length >= sentences.filter((x) => /search|attach|switch|heal|draw|damage|prize|hp/i.test(x)).length)) {
        return { ok: false, note: `só funciona com Pokémon de ${PT(o)} — seu deck não tem` };
      }
      factor *= card.category === 'Pokemon' && card.owner === o ? 0.45 : 0.55;
      notes.push(`${card.category === 'Pokemon' && card.owner === o ? `${part ? `"${part.name}"` : 'o efeito'} precisa de outro` : 'parte do efeito só vale para'} Pokémon de ${PT(o)} — seu deck não tem`);
    }
  }
  return { ok: true, factor };
}

export function requirements(card, me, opp = null) {
  const t = (card.text ?? '').replace(/\([^)]*\)/g, ' ');
  const notes = [];
  const good = [];
  let factor = 1;
  const own = ownerRequirements(card, t, me, opp, notes, good);
  if (!own.ok) return { ...own, good: [] };
  factor *= own.factor;
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
  const listInPlay = t.replace(/[’]/g, "'").match(/only if you have ([A-Z][^.]+?, and [^.]+?) in play/);
  if (listInPlay) {
    const names = listInPlay[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
    const missing = names.filter((n) => !me.names.has(n));
    if (missing.length) return { ok: false, note: `exige ${names.length} Pokémon específicos em jogo — faltam no seu deck: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`, good: [] };
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
  return { ok: true, factor, note: notes.join('; '), good };
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
  DECK_RECOVERY: (t) => `"${t.name}" devolve cartas do descarte para o deck — adia o deck out.`,
  STATUS_CURE: (t) => `"${t.name}" tira/evita Condições Especiais — responde a paralisia e sono.`,
  HEAL_BLOCK: (t) => `"${t.name}" impede a cura — o dano do 1º ataque fica.`,
  STARTER: (t, ax) => `${t.name} (${t.hp} HP, recuo barato, 1 prêmio) aguenta o ataque cedo (~${Math.round(ax.maxDmg ?? 0)}) — bom para começar no Ativo enquanto você monta.`,
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
      if (t.kind === 'STARTER' && t.hp <= (ax.maxDmg ?? 0)) continue; // não aguenta o ataque cedo
      if (t.kind === 'SWITCH' && ax.key === 'status_lock' && card.category === 'Pokemon') continue;
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
        why: WHY[t.kind](t, { ...AXES[ax.key], ...ax }) + (t.finds ? ` No seu deck, encontra: ${[...new Set(t.finds)].slice(0, 3).join(', ')}.` : '') + (req.note ? ` (Atenção: ${req.note}.)` : '') + (lockedItem ? ' (Mas é Item: fica travado pela própria trava de Itens.)' : '') });
    }
  }
  // um motivo por eixo (o mais forte)
  const best = {};
  for (const r of reasons) if (!best[r.axis] || r.value > best[r.axis].value) best[r.axis] = r;
  return Object.values(best);
}
