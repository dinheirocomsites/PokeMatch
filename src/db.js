// Carrega a base local de cartas e monta índices de busca.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASIC_ENERGY = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'].map((t) => `${t} Energy`);

export function normName(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

// Enriquece cada carta com campos derivados que o motor usa.
function enrich(c) {
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

let cache;
export function loadDb(path = join(ROOT, 'data', 'cards.json')) {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
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
  // ACE SPEC vale pelo nome: se qualquer impressão é ACE SPEC, todas são.
  for (const prints of byName.values()) {
    if (prints.some((p) => p.aceSpec)) prints.forEach((p) => (p.aceSpec = true));
  }
  // Uma carta "canônica" por nome (a mais recente com texto), usada nas sugestões.
  const unique = [...byName.values()].map((prints) => prints.find((p) => !/^tk-/.test(p.set?.id)) ?? prints[0]);
  cache = { syncedAt: raw.syncedAt, marks: raw.marks, sets: raw.sets, cards, unique, byId, bySetNum, byName };
  return cache;
}
