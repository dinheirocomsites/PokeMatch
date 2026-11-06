// Base de cartas: normalização, campos derivados e índices (sem dependências de Node).
import { setTraits, ownerOf } from './tags.js';
export const BASIC_ENERGY = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'].map((t) => `${t} Energy`);

export function normName(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

// Enriquece cada carta com campos derivados que o motor usa.
// Texto limpo: a API às vezes manda HTML ("<span class=energy-symbol Lightning>" → {L}; "<em>(…)</em>" → "(…)")
const ESYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Dragon: 'N', Colorless: 'C', Fairy: 'Y' };
export function cleanText(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/<span class="energy-symbol (\w+)"[^>]*>[^<]*<\/span>/g, (_, t) => `{${ESYM[t] ?? t[0]}}`)
    .replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ').trim();
}

function enrich(c0) {
  const c = { ...c0, effect: cleanText(c0.effect), abilities: c0.abilities?.map((a) => ({ ...a, effect: cleanText(a.effect) })), attacks: c0.attacks?.map((a) => ({ ...a, effect: cleanText(a.effect) })) };
  const isPokemon = c.category === 'Pokemon';
  const isEx = isPokemon && (/ ex$/i.test(c.name) || c.suffix === 'EX' || c.suffix === 'ex');
  const isMega = isPokemon && /^Mega /.test(c.name);
  const stage = isPokemon ? (c.stage ?? 'Basic') : null;
  const aceSpec = /ACE SPEC/i.test(c.rarity ?? '');
  const isBasicEnergy = c.category === 'Energy' && BASIC_ENERGY.includes(c.name);
  const text = [
    ...(c.abilities ?? []).map((a) => `${a.name}: ${a.effect ?? ''}`),
    ...(c.attacks ?? []).map((a) => `${a.name}: ${a.effect ?? ''}`),
    c.effect ?? '',
  ].join('\n');
  return {
    ...c,
    owner: ownerOf(c),
    regulationMark: c.regulationMark?.toUpperCase?.() ?? c.regulationMark,
    stage,
    isEx,
    isMega,
    isRuleBox: isEx || isMega,
    prizeValue: isMega ? 3 : isEx ? 2 : 1,
    aceSpec,
    isBasicEnergy,
    isSpecialEnergy: c.category === 'Energy' && !isBasicEnergy,
    text,
  };
}

// Monta a base a partir do JSON (funciona no Node e no navegador)
export function buildDb(raw) {
  // Subtipos Tera/Ancient/Future vindos da Pokémon TCG API (o TCGdex não informa)
  if (raw.traits) setTraits(raw.traits);
  const cards = raw.cards.map(enrich);
  const byId = new Map();
  const bySetNum = new Map(); // "TWM-84" -> card
  const byName = new Map(); // nome normalizado -> [impressões]
  for (const c of cards) {
    byId.set(c.id, c);
    const code = raw.sets[c.set?.id]?.code;
    c.setCode = code ?? null;
    const num = parseInt(c.localId, 10);
    if (code && !Number.isNaN(num)) bySetNum.set(`${code}-${num}`, c);
    const k = normName(c.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(c);
  }
  // Nome em português por nome em inglês (qualquer impressão que tenha)
  const ptNames = new Map(); // nome-pt normalizado -> nome-en
  for (const [k, prints] of byName) {
    const pt = prints.find((p) => p.namePt)?.namePt;
    if (pt) { prints.forEach((p) => (p.namePt = pt)); ptNames.set(normName(pt), prints[0].name); }
  }
  // ACE SPEC vale pelo nome: se qualquer impressão é ACE SPEC, todas são.
  for (const prints of byName.values()) {
    if (prints.some((p) => p.aceSpec)) prints.forEach((p) => (p.aceSpec = true));
  }
  // Uma carta "canônica" por nome (a mais recente com texto), usada nas sugestões.
  // Cartas com o MESMO nome podem ter textos diferentes (ex.: Girafarig TEF × TWM) — são cartas diferentes.
  // "unique" guarda uma impressão por versão (nome + texto); "versionsByName" agrupa as versões.
  const unique = [];
  const versionsByName = new Map();
  for (const [k, prints] of byName) {
    const bySig = new Map();
    for (const p of prints) {
      const sig = JSON.stringify([p.hp, p.abilities, (p.attacks ?? []).map((a) => [a.name, a.cost, a.damage]), p.effect]);
      if (!bySig.has(sig)) bySig.set(sig, []);
      bySig.get(sig).push(p);
    }
    const versions = [...bySig.values()].map((ps) => ps.find((p) => !/^tk-/.test(p.set?.id) && p.image) ?? ps[0]);
    versionsByName.set(k, versions);
    unique.push(...versions);
  }
  return { syncedAt: raw.syncedAt, marks: raw.marks, sets: raw.sets, cards, unique, versionsByName, byId, bySetNum, byName, ptNames };
}
