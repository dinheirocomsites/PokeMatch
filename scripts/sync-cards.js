// Baixa do TCGdex todas as cartas com marca de regulamento legal no Standard
// e salva em data/cards.json (base local usada pelo motor de análise).
import { writeFile, mkdir } from 'node:fs/promises';
import { MIN_MARK, API_GRAPHQL, API_REST } from '../src/config.js';

const FIELDS = `id localId name regulationMark category stage hp types evolveFrom suffix
  trainerType energyType effect retreat rarity image
  abilities { type name effect }
  attacks { name cost damage effect }
  weaknesses { type value } resistances { type value }
  legal { standard }
  set { id name }`;

async function gql(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(API_GRAPHQL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      return json.data;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function fetchByMark(mark) {
  const all = [];
  for (let page = 1; ; page++) {
    const data = await gql(`{ cards(filters:{regulationMark:"${mark}"}, pagination:{page:${page},count:100}) { ${FIELDS} } }`);
    const batch = data.cards ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}


async function fetchSetDetail(id) {
  const res = await fetch(`${API_REST}/sets/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const d = await res.json();
  return { id: d.id, name: d.name, code: d.abbreviation?.official ?? null, releaseDate: d.releaseDate, serie: d.serie?.id };
}

async function main() {
  // Busca da marca mínima em diante; para quando duas marcas seguidas vierem vazias
  // (assim marcas futuras como K, L… entram automaticamente).
  console.log(`Standard: marca ${MIN_MARK} em diante`);
  const cards = [];
  const marks = [];
  let empty = 0;
  for (let code = MIN_MARK.charCodeAt(0); code <= 'Z'.charCodeAt(0) && empty < 2; code++) {
    const mark = String.fromCharCode(code);
    const seen = new Set();
    let batch = [];
    // a API às vezes grava a marca em minúsculo (ex.: mep-051 = "j")
    for (const m of [mark, mark.toLowerCase()]) {
      for (const c of await fetchByMark(m)) if (!seen.has(c.id)) { seen.add(c.id); batch.push(c); }
    }
    if (!batch.length) { empty++; continue; }
    empty = 0;
    marks.push(mark);
    console.log(`  marca ${mark}: ${batch.length} cartas`);
    cards.push(...batch);
  }

  // Energias básicas não têm marca de regulamento e são sempre legais.
  const energy = { cards: [] };
  for (const n of ["Grass","Fire","Water","Lightning","Psychic","Fighting","Darkness","Metal"]) {
    const d = await gql(`{ cards(filters:{name:"${n} Energy"}, pagination:{page:1,count:100}) { ${FIELDS} } }`);
    energy.cards.push(...(d.cards ?? []));
  }
  const basics = (energy.cards ?? []).filter((c) => c.energyType === 'Normal' && /^(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal) Energy$/.test(c.name));
  // Fica com uma impressão de cada energia básica (para referência)
  const seenEnergy = new Set();
  for (const c of basics) {
    if (seenEnergy.has(c.name)) continue;
    seenEnergy.add(c.name);
    cards.push({ ...c, regulationMark: 'BASIC' });
  }

  // Descarta cartas com dados incompletos (sem texto nenhum)
  const usable = cards.filter((c) => c.category && (c.category !== 'Pokemon' || c.attacks || c.abilities));

  // Detalhes dos sets (código usado nas listas: TWM, MEG, PFL…)
  const setIds = [...new Set(usable.map((c) => c.set?.id).filter(Boolean))];
  const sets = {};
  for (const id of setIds) {
    const d = await fetchSetDetail(id);
    if (d) sets[id] = d;
  }

  // Conferência: marca de regulamento × flag legal da API
  const mismatch = usable.filter((c) => c.regulationMark !== 'BASIC' && c.legal?.standard === false);
  console.log(`Conferência: ${mismatch.length} cartas com marca legal mas flag da API = false`);
  if (mismatch.length) console.log('  exemplos:', mismatch.slice(0, 5).map((c) => c.id).join(', '));

  await mkdir('data', { recursive: true });
  await writeFile('data/cards.json', JSON.stringify({ syncedAt: new Date().toISOString(), marks, sets, cards: usable }));
  console.log(`OK: ${usable.length} cartas, ${Object.keys(sets).length} sets → data/cards.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
