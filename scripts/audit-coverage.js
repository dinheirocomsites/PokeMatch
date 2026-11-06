// Auditoria de cobertura: quais frases das cartas legais NENHUMA parte da ferramenta entende.
// Uso: npm run audit:coverage
import { loadDb } from '../src/db.js';
import { extractTags } from '../src/tags.js';
import { counterTags } from '../src/diagnosis.js';
import { damageVs, unparsed } from '../src/damage.js';

const db = loadDb();
import { readFileSync } from 'node:fs';
import { parseDeck } from '../src/parser.js';
// DECKS=1: mostra só as cartas das listas de teste
const DECK_NAMES = new Set((process.env.DECKS ? ['sharpedo', 'basic-box', 'dragapult'] : []).flatMap((f) => parseDeck(readFileSync(`test/decks/${f}.txt`, 'utf8'), db).cards.filter((e) => e.card).map((e) => e.card.name)));
const strip = (s) => (s ?? '').replace(/\([^)]*\)/g, ' ');
const sentences = (s) => strip(s).split(/(?<=[.!])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 3);

// Padrões que outros módulos já tratam (consistência, sinergia, requisitos, simulador)
const KNOWN = [
  /search your deck for/i, /draws? \d+ cards?|draw cards until/i, /switch 1 of your benched .*with your active/i,
  /attach (it|a basic|up to \d+ basic).*energy/i, /move up to \d+ damage counters/i, /fewer prize/i,
  /only if (you|your opponent) |you can use this card only/i, /can.t use more than 1 .* ability each turn/i,
  /if you go (first|second)|during your first turn/i, /if you have \d+ or (more|fewer) cards in your hand/i,
  /attacks used by the poisoned/i, /provides? (every type of )?\{?[a-z]*\}? ?energy/i, /if this pok[eé]mon has any damage counters/i,
  /for each prize card/i, /is now poisoned/i,
  // usados pelo simulador
  /put \d+ damage counters on your opponent.s benched/i, /damage to (1|2|each) of your opponent.s benched/i,
  /during your next turn, this pok[eé]mon can.t/i, /discard (all|\d+|an?) energy from this pok[eé]mon/i, /this pok[eé]mon takes \d+ more damage/i,
  /gets \+\d+ hp/i, /can use the attacks of any of your benched/i, /weakness of each of your opponent/i,
  /whenever any player puts a basic/i, /can.t play any item cards/i,
  // Pokémon de Treinador (requisitos, buscas, bônus de grupo, contagem e cópia de ataque)
  /(team rocket|n|hop|ethan|cynthia|marnie|larry|steven|erika|misty|iono|arven|lillie)['’]s pok[eé]mon/i, /choose 1 of your benched .*attacks and use it as this attack/i,
  /only if you have [A-Z][^.]+, and [^.]+ in play/,
];

const FAMILIES = [
  ['Desvantagem do próprio ataque (não pode atacar / descarta energia / recebe mais dano)', /this pok[eé]mon can.t (attack|use)|during your next turn, this pok[eé]mon (can.t|takes)|discard (all|\d+|an?) energy from this pok[eé]mon|this pok[eé]mon also does \d+ damage to itself/i],
  ['Cura', /\bheal/i],
  ['Condições especiais (sono, paralisia, confusão, queimadura, veneno)', /asleep|paralyzed|confused|burned|poisoned|special condition/i],
  ['Recuo / troca / prender no Ativo', /retreat|switch|can.t retreat/i],
  ['Colocar / mover contadores de dano', /damage counters?/i],
  ['Dano no banco / em vários Pokémon', /benched pok[eé]mon|each of your opponent.s pok[eé]mon/i],
  ['Energia (ligar, mover, devolver, descartar a própria)', /energy/i],
  ['Evolução (acelerar, evoluir do deck, devolver evolução)', /evolve|evolution|devolve/i],
  ['Voltar para a mão / embaralhar no deck', /into your hand|into their hand|shuffle .* into (your|their) deck/i],
  ['Copiar ataques', /use (it|1 of|the) .*attacks?|choose 1 of .* attacks|as this attack/i],
  ['Descarte do deck do oponente (moinho) / topo do deck', /top (card|\d+ cards?) of (your|your opponent.s) deck|discard .* deck/i],
  ['Ferramentas e Estádios', /pok[eé]mon tool|stadium/i],
  ['HP extra / alterar HP', /\+\d+ hp|gets [+-]\d+ hp|hp/i],
  ['Imunidade a efeitos', /effects of|isn.t affected|can.t be affected/i],
  ['Prêmios', /prize/i],
  ['Banco (tamanho, colocar Pokémon)', /bench/i],
  ['Fraqueza / Resistência', /weakness|resistance/i],
  ['Cara ou coroa', /flip/i],
  ['Mão (revelar, descartar, embaralhar)', /hand/i],
];

// Frases de ligação (não são efeito por si só)
const GLUE = /^(then, )?shuffle (your|their) deck\.?$|^flip (a|\d+) coins?\.?$|^(then, )?(reveal (it|them)|put (it|them) into your hand)(, and put (it|them) into your hand)?\.?$|^if tails, this attack does nothing\.?$|^you may do this \d+ times?\.?$/i;
let total = 0, understood = 0;
const fam = new Map();
const seenCards = new Map();
for (const c of db.unique) {
  const blocks = [
    ...(c.abilities ?? []).map((a) => ({ kind: 'ability', name: a.name, text: a.effect })),
    ...(c.attacks ?? []).map((a) => ({ kind: 'attack', name: a.name, text: a.effect, atk: a })),
    ...(c.category !== 'Pokemon' && c.effect ? [{ kind: 'trainer', name: c.name, text: c.effect }] : []),
  ];
  for (const b of blocks) for (const s0 of sentences(b.text)) {
    if (GLUE.test(s0)) continue;
    const s = s0.replace(/^if heads, /i, '');
    total++;
    const pseudo = b.kind === 'ability' ? { category: 'Pokemon', name: c.name, abilities: [{ name: b.name, effect: s }], text: s }
      : b.kind === 'attack' ? { category: 'Pokemon', name: c.name, attacks: [{ ...b.atk, effect: s }], text: s }
      : { category: c.category, trainerType: c.trainerType, name: c.name, effect: s, text: s };
    let ok = extractTags(pseudo).some((t) => t.kind !== 'STADIUM_REPLACE') || counterTags(pseudo).length > 0 || KNOWN.some((re) => re.test(s));
    if (!ok && b.kind === 'attack' && /damage/i.test(s)) {
      const before = [...unparsed.values()].reduce((x, y) => x + y, 0);
      damageVs({ ...b.atk, effect: s }, c, { category: 'Pokemon', stage: 'Basic', hp: 200, isEx: true, types: [], weaknesses: [] }, { deck: { counts: { basic: 6 }, entries: [] } });
      ok = [...unparsed.values()].reduce((x, y) => x + y, 0) === before && /more damage|damage for each|does \d+ damage to (1|2|each)/i.test(s);
    }
    if (ok) { understood++; continue; }
    const f = FAMILIES.find(([, re]) => re.test(s))?.[0] ?? 'Outros';
    if (process.env.DECKS && !DECK_NAMES.has(c.name)) continue;
    if (!fam.has(f)) fam.set(f, { n: 0, cards: new Set(), ex: [] });
    const e = fam.get(f); e.n++; e.cards.add(c.name); if (e.ex.length < (process.env.DECKS ? 12 : 4)) e.ex.push(`${c.name}: ${s.slice(0, 95)}`);
  }
}
console.log(`Frases de efeito nas cartas legais: ${total}`);
console.log(`Entendidas por alguma parte da ferramenta: ${understood} (${Math.round((understood / total) * 100)}%)`);
console.log(`Não classificadas: ${total - understood}\n`);
for (const [f, e] of [...fam.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${String(e.n).padStart(4)} frases · ${String(e.cards.size).padStart(3)} cartas — ${f}`);
  e.ex.forEach((x) => console.log(`        ex.: ${x}`));
}
