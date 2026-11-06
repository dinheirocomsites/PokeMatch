// Consistência: simulação de Monte Carlo dos primeiros turnos.
// Responde "quanto de consistência eu perco ao colocar esta tech?" comparando
// a lista atual com a lista depois da troca sugerida.
//
// Modelo (simplificado e explícito):
// - Embaralha, compra 7 (mulligan se não houver Básico), separa 6 prêmios.
// - Compra 1 por turno (turno 1 sem compra = você começa; média com quem vai 2º).
// - 1 Supporter de compra por turno, se houver na mão (ex.: Lillie's: +6/+8, Judge: +4).
// - Uma carta "está acessível" se foi vista OU se há uma busca vista que a encontra
//   (Ultra Ball → Pokémon; Poké Pad → sem Rule Box; Poffin → Básico ≤70 HP; Petrel → Treinador…).
//   Cada busca é usada uma vez.

import { ownerSearches, ownerSearchFinds } from './tags.js';

const TRIALS = 6000;

// Que cartas uma busca encontra
function searcherOf(card) {
  const t = card.text ?? '';
  // Busca de Pokémon de Treinador (Hop's Bag, Team Rocket's Proton, Cynthia's Gabite, Spikemuth Gym…)
  const own = ownerSearches(t);
  if (own.length) return (c) => ownerSearchFinds(own, c);
  if (/search your deck for a pok[eé]mon that doesn.t have a rule box/i.test(t)) return (c) => c.category === 'Pokemon' && !c.isRuleBox;
  if (/search your deck for up to \d+ basic pok[eé]mon with (\d+) hp or less/i.test(t)) { const hp = +t.match(/with (\d+) hp or less/i)[1]; return (c) => c.category === 'Pokemon' && c.stage === 'Basic' && c.hp <= hp; }
  if (/search your deck for up to \d+ basic pok[eé]mon or 1 evolution pok[eé]mon/i.test(t)) return (c) => c.category === 'Pokemon';
  if (/search your deck for a pok[eé]mon(,|\s|\.)/i.test(t) && card.category === 'Trainer') return (c) => c.category === 'Pokemon';
  if (/search your deck for a trainer card/i.test(t)) return (c) => c.category === 'Trainer';
  if (/search your deck for (a|up to \d+) basic energy/i.test(t) && card.category === 'Trainer') return (c) => c.isBasicEnergy;
  // Buscas feitas por Pokémon (ataque ou habilidade): Toxel "Call for Family", Meowth ex "Last-Ditch Catch"
  if (card.category === 'Pokemon') {
    if (/search your deck for (up to \d+ )?basic pok[eé]mon/i.test(t)) return (c) => c.category === 'Pokemon' && c.stage === 'Basic';
    if (/search your deck for a supporter card/i.test(t)) return (c) => c.trainerType === 'Supporter';
  }
  return genericSearch(t);
}

// Demais buscas (Treinador ou Pokémon): qualquer carta, {X} Pokémon, Evolução/Estágio, Ferramenta, Item, Estádio, energia {X}
const SYMC = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless' };
export function genericSearch(text) {
  const t = (text ?? '').replace(/[’]/g, "'");
  const m = t.match(/search your deck for (?:a|an|up to \d+|any number of|\d+)(?: in any combination of)? ([^,.]+?)(?:,| and put| and attach| and shuffle| reveal|\.)/i);
  if (!m) return null;
  const what = m[1].toLowerCase();
  const typ = what.match(/\{([a-z])\}/i)?.[1]?.toUpperCase();
  const T = typ && SYMC[typ];
  const parts = what.split(/ and | or /);
  const preds = parts.map((w) => {
    if (/^cards?$/.test(w.trim())) return () => true;
    if (/energy/.test(w)) return (c) => c.category === 'Energy' && (!/basic/.test(w) || c.isBasicEnergy) && (!T || c.name === `${T} Energy` || (c.types ?? []).includes(T));
    if (/pok[eé]mon tool/.test(w)) return (c) => c.trainerType === 'Tool';
    if (/item/.test(w)) return (c) => c.trainerType === 'Item';
    if (/stadium/.test(w)) return (c) => c.trainerType === 'Stadium';
    if (/supporter/.test(w)) return (c) => c.trainerType === 'Supporter';
    if (/trainer/.test(w)) return (c) => c.category === 'Trainer';
    if (/pok[eé]mon/.test(w)) {
      return (c) => c.category === 'Pokemon'
        && (!/basic/.test(w) || c.stage === 'Basic')
        && (!/evolution/.test(w) || (c.stage && c.stage !== 'Basic'))
        && (!/stage 1/.test(w) || c.stage === 'Stage1') && (!/stage 2/.test(w) || c.stage === 'Stage2')
        && (!/\bex\b/.test(w) || c.isEx)
        && (!T || (c.types ?? []).includes(T));
    }
    return null;
  }).filter(Boolean);
  return preds.length ? (c) => preds.some((f) => f(c)) : null;
}
export { searcherOf };
function drawOf(card) {
  if (card.trainerType !== 'Supporter') return 0;
  const m = (card.text ?? '').match(/draws? (\d+|a) cards?/i);
  return m ? (m[1] === 'a' ? 1 : +m[1]) : 0;
}
// Habilidade de compra repetível (conta a partir do turno seguinte ao Pokémon aparecer)
function abilityDrawOf(card) {
  if (card.category !== 'Pokemon') return 0;
  let best = 0;
  for (const a of card.abilities ?? []) {
    const t = a.effect ?? '';
    if (!/once during your turn/i.test(t) || /only if|if any of your pok[eé]mon were knocked out/i.test(t)) continue;
    const m = t.match(/draw (\d+|a) cards?/i);
    let n = m ? (m[1] === 'a' ? 1 : +m[1]) : /look at the top \d+ cards of your deck and put 1 of them into your hand/i.test(t) ? 1 : 0;
    if (/if this pok[eé]mon is in the active spot/i.test(t)) n = n / 2;
    best = Math.max(best, n);
  }
  return best;
}

function expand(entries) {
  const deck = [];
  for (const e of entries) for (let i = 0; i < e.count; i++) deck.push(e.card);
  return deck;
}

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// PRNG com semente: resultados estáveis entre execuções
function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// goals: [{ key, label, turn, needs: [cardName...] }]  (todas as peças precisam estar acessíveis)
export function simulateConsistency(entries, goals, { trials = TRIALS, seed = 42 } = {}) {
  const deck = expand(entries);
  const rnd = mulberry32(seed);
  const searchers = new Map(deck.map((c) => [c.id, searcherOf(c)]));
  const abilityDraw = new Map(deck.map((c) => [c.id, abilityDrawOf(c)]));
  const hits = Object.fromEntries(goals.map((g) => [g.key, 0]));
  let supporterOpen = 0;
  const prized = {};
  const allNeeds = [...new Set(goals.flatMap((g) => g.needs))];
  for (const n of allNeeds) prized[n] = 0;
  const maxTurn = Math.max(...goals.map((g) => g.turn));

  for (let t = 0; t < trials; t++) {
    let order;
    do { order = shuffle(deck.slice(), rnd); } while (!order.slice(0, 7).some((c) => c.category === 'Pokemon' && c.stage === 'Basic'));
    const prizes = order.slice(7, 13);
    const pile = [...order.slice(0, 7), ...order.slice(13)]; // cartas na ordem em que você as veria
    for (const n of allNeeds) if (prizes.some((c) => c.name === n) && !pile.some((c) => c.name === n)) prized[n]++;
    let seen = 7;
    if (pile.slice(0, 7).some((c) => c.trainerType === 'Supporter')) supporterOpen++;
    const usedSupporter = new Set();
    const seenAt = [];
    for (let turn = 1; turn <= maxTurn; turn++) {
      if (turn > 1 || rnd() < 0.5) seen++; // quem começa não compra no T1
      // Habilidades de compra de Pokémon que já apareceram em turnos anteriores
      if (turn > 1) { let extra = 0; for (let i = 0; i < Math.min(seenAt[turn - 1] ?? 7, pile.length); i++) extra = Math.max(extra, abilityDraw.get(pile[i].id) ?? 0); seen += Math.round(extra); }
      // usa 1 Supporter de compra visto e ainda não usado
      for (let i = 0; i < seen; i++) {
        const d = drawOf(pile[i]);
        if (d && !usedSupporter.has(i)) { usedSupporter.add(i); seen += d; break; }
      }
      seenAt[turn] = Math.min(seen, pile.length);
    }
    for (const g of goals) {
      const view = pile.slice(0, seenAt[g.turn]);
      const rest = pile.slice(seenAt[g.turn]);
      const usedSearch = new Set();
      let ok = true;
      for (const need of g.needs) {
        const idx = view.findIndex((c, i) => c.name === need && !usedSearch.has(`c${i}`));
        if (idx >= 0) { usedSearch.add(`c${idx}`); continue; }
        // busca: precisa de um buscador visto e da carta ainda no baralho (não nos prêmios)
        const target = rest.find((c) => c.name === need);
        const s = target && view.findIndex((c, i) => !usedSearch.has(`s${i}`) && searchers.get(c.id)?.(target) && (!/only if you discard (\d+)/i.test(c.text ?? '') || view.length - usedSearch.size >= 1 + +(c.text.match(/only if you discard (\d+)/i)?.[1] ?? 0)));
        if (target && s >= 0) { usedSearch.add(`s${s}`); continue; }
        ok = false;
        break;
      }
      if (ok) hits[g.key]++;
    }
  }
  const pct = (x) => Math.round((x / trials) * 1000) / 10;
  return {
    goals: goals.map((g) => ({ key: g.key, label: g.label, pct: pct(hits[g.key]) })),
    supporterOpen: pct(supporterOpen),
    prized: Object.fromEntries(Object.entries(prized).map(([k, v]) => [k, pct(v)])),
  };
}

// Aplica a troca (sai X, entra Y) na lista
export function applySwap(entries, out, adds) {
  const next = entries.map((e) => ({ ...e }));
  for (const o of out) {
    const e = next.find((x) => x.card.name === o.name);
    if (e) e.count -= o.qty;
  }
  for (const a of adds) {
    if (!a.card) continue;
    const e = next.find((x) => x.card.name === a.card.name);
    if (e) e.count += a.qty; else next.push({ count: a.qty, name: a.card.name, card: a.card });
  }
  return next.filter((e) => e.count > 0);
}

// Compara antes × depois para uma sugestão
export function consistencyImpact(me, suggestion) {
  const main = me.mainAttacker;
  const mainLine = main ? [main.evolveFrom, main.name].filter(Boolean) : [];
  const techPieces = suggestion.pkg?.adds?.filter((a) => a.card && a.role !== 'energia habilitadora').map((a) => a.card.name) ?? [suggestion.card.name];
  const goals = [];
  if (mainLine.length) goals.push({ key: 'setup', label: `${mainLine.join(' → ')} até o turno 2`, turn: 2, needs: mainLine });
  goals.push({ key: 'tech', label: `${techPieces.join(' + ')} até o turno 3`, turn: 3, needs: techPieces });
  const after = applySwap(me.entries, suggestion.swap?.out ?? [], suggestion.pkg?.adds ?? [{ qty: 1, card: suggestion.card }]);
  const before = simulateConsistency(me.entries, goals.filter((g) => g.key !== 'tech'));
  const now = simulateConsistency(after, goals);
  const setupB = before.goals.find((g) => g.key === 'setup')?.pct;
  const setupA = now.goals.find((g) => g.key === 'setup')?.pct;
  const delta = setupB != null ? Math.round((setupA - setupB) * 10) / 10 : 0;
  const supDelta = Math.round((now.supporterOpen - before.supporterOpen) * 10) / 10;
  const tech = now.goals.find((g) => g.key === 'tech');
  const worstPrized = Math.max(0, ...techPieces.map((n) => now.prized[n] ?? 0));
  const loss = Math.max(0, -delta) + Math.max(0, -supDelta) * 0.8;
  const verdict = loss <= 2 ? 'baixo' : loss <= 5 ? 'moderado' : 'alto';
  // Tech difícil de achar a tempo vale menos
  const reachFactor = tech.pct < 35 ? 0.88 : tech.pct < 45 ? 0.95 : 1;
  const notes = [];
  if (setupB != null) notes.push(`${goals[0].label}: ${setupB}% → ${setupA}%${Math.abs(delta) < 1 ? ' (sem mudança relevante)' : ''}.`);
  if (Math.abs(supDelta) >= 1) notes.push(`Supporter na mão inicial: ${before.supporterOpen}% → ${now.supporterOpen}% (${supDelta > 0 ? '+' : ''}${supDelta} pp)${supDelta < 0 && (suggestion.swap?.out ?? []).some((o) => o.card?.trainerType === 'Supporter' || /judge|lillie|iono/i.test(o.name)) ? ' — custo de tirar um Supporter.' : '.'}`);
  notes.push(`Você acha ${tech.label}: ${tech.pct}% das partidas${tech.pct < 45 ? ' — tech para o meio do jogo, não para o começo' : ''}.`);
  if (worstPrized >= 8) notes.push(`Risco de uma peça ficar presa nos prêmios: ${worstPrized}% (cópia única).`);
  return {
    setup: setupB != null ? { label: goals[0].label, before: setupB, after: setupA, delta } : null,
    supporter: { before: before.supporterOpen, after: now.supporterOpen, delta: supDelta },
    tech: { label: tech.label, pct: tech.pct, prized: worstPrized },
    verdict,
    notes,
    factor: Math.max(0.6, 1 - Math.max(0, loss - 1.5) / 25) * reachFactor,
  };
}
