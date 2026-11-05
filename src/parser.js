// Lê listas no formato de exportação do Pokémon TCG Live / Limitless:
//   Pokémon: 12
//   4 Carvanha PFL 60
//   Trainer: 36
//   4 Ultra Ball MEG 131
//   Energy: 12
//   8 Basic {D} Energy SVE 7
import { normName, BASIC_ENERGY } from './db.js';

const ENERGY_SYMBOL = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal' };
// Códigos usados pelo Live que diferem da abreviação oficial
const SET_ALIASES = { 'PR-SV': 'SVP', 'PR-ME': 'MEP', 'SVE': null, 'MEE': 'MEE' };

const LINE = /^\s*(\d+)\s*x?\s+(.+?)(?:\s+([A-Z0-9][A-Z0-9-]{1,6})\s+([A-Z]{0,4}\d+[a-z]?))?\s*$/;

function canonicalEnergyName(name) {
  const m = name.match(/^(?:Basic\s+)?\{([GRWLPFDM])\}\s+Energy$/i);
  if (m) return `${ENERGY_SYMBOL[m[1].toUpperCase()]} Energy`;
  const m2 = name.match(/^(?:Basic\s+)?(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal)\s+Energy$/i);
  if (m2) return `${m2[1][0].toUpperCase()}${m2[1].slice(1).toLowerCase()} Energy`;
  return null;
}

export function parseDeck(text, db) {
  const entries = [];
  const errors = [];
  const warnings = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(pok[eé]mon|trainer|treinador|energy|energia|total cards)\b.*:?\s*\d*\s*$/i.test(line)) continue;
    if (/^(\*{2}|#|\/\/)/.test(line)) continue;
    const m = line.match(LINE);
    if (!m) { warnings.push(`Linha ignorada: "${line}"`); continue; }

    const count = parseInt(m[1], 10);
    let [, , name, setCode, num] = m;
    name = name.trim();

    let card = null;
    const energy = canonicalEnergyName(name);
    if (energy) {
      card = db.byName.get(normName(energy))?.[0] ?? null;
    }
    if (!card && setCode && num) {
      const code = SET_ALIASES[setCode] === undefined ? setCode : SET_ALIASES[setCode];
      const n = parseInt(num.replace(/^[A-Z]+/, ''), 10);
      if (code) {
        const hit = db.bySetNum.get(`${code}-${n}`);
        if (hit && normName(hit.name) === normName(name)) card = hit;
      }
    }
    // Legalidade vale pelo nome: impressão antiga é legal se existe reimpressão legal.
    if (!card) card = db.byName.get(normName(name))?.[0] ?? null;
    if (!card && setCode) {
      // O regex pode ter "comido" parte do nome achando que era set+número
      card = db.byName.get(normName(`${name} ${setCode} ${num}`))?.[0] ?? null;
    }

    if (!card) {
      errors.push(`"${name}"${setCode ? ` (${setCode} ${num})` : ''} não está legal no Standard (ou não foi encontrada)`);
      entries.push({ count, name, card: null });
      continue;
    }
    entries.push({ count, name: card.name, card });
  }

  // Junta linhas repetidas do mesmo nome
  const merged = new Map();
  for (const e of entries) {
    const k = e.card ? `${e.card.name}|${e.card.id}` : `?|${e.name}`;
    if (merged.has(k)) merged.get(k).count += e.count;
    else merged.set(k, { ...e });
  }
  const cards = [...merged.values()];

  // Validações de construção
  const total = cards.reduce((s, e) => s + e.count, 0);
  if (total !== 60) errors.push(`A lista tem ${total} cartas (precisa ter 60)`);
  const perName = new Map();
  for (const e of cards) if (e.card && !BASIC_ENERGY.includes(e.card.name)) perName.set(e.card.name, (perName.get(e.card.name) ?? 0) + e.count);
  for (const [n, c] of perName) if (c > 4) errors.push(`${c} cópias de "${n}" (máximo 4)`);
  const aces = cards.filter((e) => e.card?.aceSpec).reduce((s, e) => s + e.count, 0);
  if (aces > 1) errors.push(`${aces} cartas ACE SPEC (máximo 1)`);
  if (!cards.some((e) => e.card?.category === 'Pokemon' && e.card.stage === 'Basic')) errors.push('A lista não tem nenhum Pokémon Básico');

  return { cards, total, errors, warnings };
}
