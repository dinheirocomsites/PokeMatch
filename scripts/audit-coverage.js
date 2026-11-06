// Auditoria de cobertura do TEXTO das cartas legais, em 3 níveis:
//   lido    — alguma parte da ferramenta reconhece a frase (etiqueta, regra, requisito, dano)
//   usado   — o que foi reconhecido muda a nota, o diagnóstico ou a simulação
//   testado — a carta aparece num teste ou numa lista de teste
// Frases de ligação ("Once during your turn, you may use this Ability.") e pedaços que dependem da frase
// anterior ("If you do, …", "prevent that damage.") contam junto com o efeito a que pertencem.
// Uso: npm run audit:coverage   ·   DECKS=1 (só cartas das listas de teste)   ·   --json (resumo para testes)
import { readFileSync, readdirSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { extractTags } from '../src/tags.js';
import { counterTags } from '../src/diagnosis.js';
import { damageVs, unparsed } from '../src/damage.js';
import { parseDeck } from '../src/parser.js';
import { searcherOf } from '../src/consistency.js';

const db = loadDb();
const root = new URL('../', import.meta.url);
const DECK_FILES = readdirSync(new URL('test/decks/', root)).filter((f) => f.endsWith('.txt'));
const DECK_NAMES = new Set(DECK_FILES.flatMap((f) => parseDeck(readFileSync(new URL(`test/decks/${f}`, root), 'utf8'), db).cards.filter((e) => e.card).map((e) => e.card.name)));
const TEST_TEXT = readdirSync(new URL('test/', root)).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(`test/${f}`, root), 'utf8')).join('\n');
const tested = (name) => DECK_NAMES.has(name) || (name.length >= 4 && (TEST_TEXT.includes(name) || TEST_TEXT.includes(name.replace(/'/g, "\\'"))));

const strip = (s) => (s ?? '').replace(/\([^)]*\)/g, ' ');
const sentences = (s) => strip(s).split(/(?<=[.!])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 3);

// Etiquetas lidas mas que nenhum módulo usa para pontuar/simular
const READ_ONLY_KINDS = new Set(['TRAP']);

// Padrões tratados por outros módulos: [regex, nível]
const KNOWN = [
  // consistência / requisitos / perfil
  [/search your deck for/i, 'lido'], // só algumas buscas entram na simulação de mão
  [/draws? (a|\d+) cards?|draw cards until/i, 'usado'],
  [/switch 1 of your benched .*with your active/i, 'usado'],
  [/attach (it|a basic|up to \d+ basic).*energy/i, 'usado'],
  [/move up to \d+ damage counters/i, 'usado'],
  [/fewer prize/i, 'usado'],
  [/only if (you|your opponent) |you can use this card only/i, 'usado'],
  [/can.t use more than 1 .* ability each turn/i, 'usado'],
  [/if you go (first|second)|during your first turn/i, 'usado'],
  [/if you have \d+ or (more|fewer) cards in your hand/i, 'usado'],
  [/attacks used by the poisoned/i, 'usado'],
  [/provides? (every type of )?\{?[a-z]*\}? ?energy/i, 'usado'],
  [/if this pok[eé]mon has any damage counters/i, 'usado'],
  [/for each prize card/i, 'usado'],
  [/is now (?:[a-z]+ and )?(poisoned|burned)/i, 'usado'], // Checkup no simulador
  [/flip a coin until you get tails/i, 'usado'], // média no dano
  [/you must discard .+ in order to use this ability/i, 'usado'],
  // simulador
  [/put \d+ damage counters on your opponent.s benched/i, 'usado'],
  [/damage to (1|2|each) of your opponent.s benched/i, 'usado'],
  [/during your next turn, this pok[eé]mon can.t/i, 'usado'],
  [/discard (all|\d+|an?) energy from this pok[eé]mon/i, 'usado'],
  [/this pok[eé]mon takes \d+ more damage/i, 'usado'],
  [/during your opponent.s next turn, this pok[eé]mon takes \d+ less damage/i, 'usado'],
  [/gets \+\d+ hp/i, 'usado'],
  [/can use the attacks of any of your benched/i, 'usado'],
  [/weakness of each of your opponent/i, 'usado'],
  [/whenever any player puts a basic/i, 'usado'],
  [/can.t play any item cards/i, 'usado'],
  [/switch in 1 of your opponent.s benched pok[eé]mon to the active spot/i, 'usado'], // Boss / ataque que puxa
  [/isn.t affected by (any effects on your opponent.s active|weakness|resistance)/i, 'usado'],
  [/(defending|opponent.s active) pok[eé]mon is now (?:[a-z]+ and )?(paralyzed|asleep)/i, 'usado'], // eixo paralisia/sono
  [/discard the top (\d+|card)[^.]* of your opponent.s deck/i, 'usado'], // eixo moinho
  [/heal (\d+|all) damage/i, 'usado'],
  [/each player shuffles their hand into their deck/i, 'usado'], // eixo disrupção de mão
  [/put \d+ damage counters (on that pok[eé]mon )?instead of \d+/i, 'usado'], // veneno/queimadura mais forte no Checkup
  [/choose 1 of your opponent.s active pok[eé]mon.s attacks and use it as this attack/i, 'usado'],
  [/(put|shuffle) this pok[eé]mon and all attached cards into your (hand|deck)/i, 'lido'],
  [/put (up to \d+|a|an|\d+) (pok[eé]mon|supporter|trainer|item|basic [^.]*energy)[^.]* from your discard pile into your hand/i, 'lido'],
  [/discard the top (\d+ cards|card) of your deck/i, 'lido'],
  [/(reveal|look at) the top \d+ cards of your opponent.s deck/i, 'lido'],
  [/you may attach any number of basic energy cards from your hand/i, 'lido'],
  [/this attack does nothing/i, 'lido'],
  [/if this pok[eé]mon would be knocked out by damage from an attack, flip a coin|if any damage is done to this pok[eé]mon by attacks, flip a coin/i, 'lido'],
  [/this pok[eé]mon may use an attack it has twice|you may attack again/i, 'lido'],
  [/prevent all effects of (that card|attacks|your opponent)/i, 'lido'],
  [/during your opponent.s next turn, (attacks used by the defending pok[eé]mon do \d+ less damage|the defending pok[eé]mon can.t (attack|use attacks))/i, 'usado'], // simulador
  [/play this card as if it were a \d+-hp basic/i, 'lido'], [/this card can.t be affected by any special conditions and can.t retreat/i, 'lido'],
  [/this pok[eé]mon is now (asleep|confused|paralyzed)/i, 'lido'], // desvantagem própria
  [/heal from this pok[eé]mon the same amount of damage/i, 'lido'],
  [/prevent all effects of (your opponent.s pok[eé]mon.s attacks|attacks used by your opponent.s pok[eé]mon)/i, 'lido'],
  // Pokémon de Treinador (requisitos, buscas, bônus de grupo, contagem e cópia de ataque)
  [/(team rocket|n|hop|ethan|cynthia|marnie|larry|steven|erika|misty|iono|arven|lillie)['’]s pok[eé]mon/i, 'usado'],
  [/choose 1 of your benched .*attacks and use it as this attack/i, 'usado'],
  [/only if you have [A-Z][^.]+, and [^.]+ in play/, 'usado'],
];

// Frases de ligação (não são efeito por si só)
const GLUE = /^(then, )?shuffle (your|their) deck\.?$|^once during your turn, (when you play this pok[eé]mon from your hand to evolve \d+ of your pok[eé]mon|if this pok[eé]mon is in the active spot), you may use this ability\.?$|^as often as you like during your turn, you may use this ability\.?$|^look at the top \d+ cards of your deck\.?$|^shuffle your hand into your deck\.?$|^at any time during your turn, you may discard this card from play\.?$|^discard the other cards\.?$|^then, that player shuffles their deck\.?$|^your turn ends\.?$|^you may discard that card\.?$|^(then, )?flip a coin\.?$|^once during your turn, (you may flip a coin|if this pok[eé]mon is on your bench, you may use this ability)\.?$|^look at the top card of your deck\.?$|^any attached cards, damage counters, special conditions, turns in play, and any other effects remain on the new pok[eé]mon\.?$|^flip (a|\d+) coins?\.?$|^(then, )?(reveal (it|them)|put (it|them) into your hand)(, and put (it|them) into your hand)?\.?$|^if tails, this attack does nothing\.?$|^you may do this \d+ times?\.?$|^once during your turn,? you may use this ability\.?$|^you may use this ability\.?$|^(then, )?shuffle the other cards (back )?into your deck\.?$|^if you can.t, this attack does nothing\.?$|^this attack does nothing\.?$/i;
// Pedaços que só fazem sentido com a frase anterior
const FRAG = /^(if you do|if heads|if tails|if you can.t|if you (placed|switched|discarded|attached)|then\b|prevent that damage|that pok[eé]mon|it (is|isn.t|can.t)|choose (\d+|up to \d+) of|in this way|for each heads|your opponent reveals (that card|those cards)|during your opponent.s next turn, that pok[eé]mon can.t use that attack)/i;

const FAMILIES = [
  ['Desvantagem do próprio ataque (não pode atacar / descarta energia / recebe mais dano)', /this pok[eé]mon can.t (attack|use)|during your next turn, this pok[eé]mon (can.t|takes)|discard (all|\d+|an?) energy from this pok[eé]mon|this pok[eé]mon also does \d+ damage to itself/i],
  ['Cura', /\bheal/i],
  ['Condições especiais (sono, paralisia, confusão, queimadura, veneno)', /asleep|paralyzed|confused|burned|poisoned|special condition/i],
  ['Recuo / troca / prender no Ativo', /retreat|switch|can.t retreat/i],
  ['Colocar / mover contadores de dano', /damage counters?/i],
  ['Dano no banco / em vários Pokémon', /benched pok[eé]mon|each of your opponent.s pok[eé]mon/i],
  ['Energia (ligar, mover, devolver, descartar a própria)', /energy/i],
  ['Evolução (acelerar, evoluir do deck, devolver evolução)', /evolve|evolution|devolve/i],
  ['Voltar para a mão / embaralhar no deck', /into your hand|into their hand|shuffle .* into (your|their) deck|bottom of (your|their) deck/i],
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

const LEVELS = ['lido', 'usado'];
const best = (a, b) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);

// Nível de uma frase sozinha (null = não entendida)
function levelOf(s, b, c) {
  const pseudo = b.kind === 'ability' ? { category: 'Pokemon', name: c.name, abilities: [{ name: b.name, effect: s }], text: s }
    : b.kind === 'attack' ? { category: 'Pokemon', name: c.name, attacks: [{ ...b.atk, effect: s }], text: s }
    : { category: c.category, trainerType: c.trainerType, name: c.name, effect: s, text: s };
  let lvl = null;
  const tags = extractTags(pseudo).filter((t) => t.kind !== 'STADIUM_REPLACE');
  if (tags.length) lvl = tags.some((t) => !READ_ONLY_KINDS.has(t.kind)) ? 'usado' : 'lido';
  if (counterTags(pseudo).filter((t) => t.kind !== 'STARTER').length) lvl = 'usado';
  for (const [re, l] of KNOWN) if (re.test(s)) lvl = lvl ? best(lvl, l) : l;
  // busca que a simulação de mão sabe usar
  if (/search your deck/i.test(s) && searcherOf({ ...pseudo, text: s })) lvl = 'usado';
  if (!lvl && b.kind === 'attack' && /damage/i.test(s)) {
    const before = [...unparsed.values()].reduce((x, y) => x + y, 0);
    damageVs({ ...b.atk, effect: s }, c, { category: 'Pokemon', stage: 'Basic', hp: 200, isEx: true, types: [], weaknesses: [], resistances: [] }, { deck: { counts: { basic: 6 }, entries: [] } });
    if ([...unparsed.values()].reduce((x, y) => x + y, 0) === before && /more damage|damage for each|does \d+ damage to (1|2|each|the new active)|damage counters? on your opponent.s active/i.test(s)) lvl = 'usado';
  }
  return lvl;
}

const stats = { total: 0, lido: 0, usado: 0, testado: 0 };
const fam = new Map();
for (const c of db.unique) {
  if (process.env.DECKS && !DECK_NAMES.has(c.name)) continue;
  const isTested = tested(c.name);
  const blocks = [
    ...(c.abilities ?? []).map((a) => ({ kind: 'ability', name: a.name, text: a.effect })),
    ...(c.attacks ?? []).map((a) => ({ kind: 'attack', name: a.name, text: a.effect, atk: a })),
    ...(c.category !== 'Pokemon' && c.effect ? [{ kind: 'trainer', name: c.name, text: c.effect }] : []),
  ];
  for (const b of blocks) {
    const ss = sentences(b.text).filter((s) => !GLUE.test(s));
    const lv = ss.map((s) => levelOf(s.replace(/^if heads, /i, ''), b, c));
    // Ataque de dano variável lido por inteiro sem lacuna: as frases de dano dele estão entendidas
    if (b.kind === 'attack' && /[+×x]$/.test(String(b.atk.damage ?? ''))) {
      const before = [...unparsed.values()].reduce((x, y) => x + y, 0);
      damageVs(b.atk, c, { category: 'Pokemon', stage: 'Basic', hp: 200, isEx: true, types: [], weaknesses: [], resistances: [] }, { deck: { counts: { basic: 6 }, entries: [] } });
      if ([...unparsed.values()].reduce((x, y) => x + y, 0) === before) ss.forEach((s, i) => { if (!lv[i] && /damage|flip|coin/i.test(s)) lv[i] = 'usado'; });
    }
    // pedaço dependente herda o nível da frase anterior entendida
    for (let i = 1; i < ss.length; i++) if (!lv[i] && FRAG.test(ss[i]) && lv[i - 1]) lv[i] = lv[i - 1];
    ss.forEach((s, i) => {
      stats.total++;
      if (!lv[i]) {
        const f = FAMILIES.find(([, re]) => re.test(s))?.[0] ?? 'Outros';
        if (!fam.has(f)) fam.set(f, { n: 0, cards: new Set(), ex: [] });
        const e = fam.get(f); e.n++; e.cards.add(c.name); if (e.ex.length < (process.env.DECKS ? 12 : 4)) e.ex.push(`${c.name}: ${s.slice(0, 95)}`);
        return;
      }
      stats.lido++;
      if (lv[i] === 'usado') stats.usado++;
      if (lv[i] === 'usado' && isTested) stats.testado++;
    });
  }
}
const pct = (n) => Math.round((n / stats.total) * 100);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...stats, pct: { lido: pct(stats.lido), usado: pct(stats.usado), testado: pct(stats.testado) }, families: Object.fromEntries([...fam].map(([k, v]) => [k, v.n])) }));
} else {
  console.log(`Frases de efeito${process.env.DECKS ? ' (cartas das listas de teste)' : ' nas cartas legais'}: ${stats.total}`);
  console.log(`  lido    (alguma parte reconhece): ${stats.lido} (${pct(stats.lido)}%)`);
  console.log(`  usado   (muda nota/diagnóstico/simulação): ${stats.usado} (${pct(stats.usado)}%)`);
  console.log(`  testado (usado e com teste da carta): ${stats.testado} (${pct(stats.testado)}%)`);
  console.log(`Não entendidas: ${stats.total - stats.lido}\n`);
  for (const [f, e] of [...fam.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`${String(e.n).padStart(4)} frases · ${String(e.cards.size).padStart(3)} cartas — ${f}`);
    e.ex.forEach((x) => console.log(`        ex.: ${x}`));
  }
}
