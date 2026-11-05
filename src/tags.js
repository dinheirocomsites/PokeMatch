// Classificador de mecânicas: lê o texto (inglês) de habilidades, ataques e
// treinadores e extrai "etiquetas de counter" estruturadas, incluindo QUEM é
// afetado (seletor). Ex.: Farigiraf ex → WALL_SELF { stage: Basic, ex: true }.

const SYM = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless', Y: 'Fairy' };

// Listas curadas para traços que a API não informa.
export const TERA = new Set(['Teal Mask Ogerpon ex', 'Hearthflame Mask Ogerpon ex', 'Wellspring Mask Ogerpon ex', 'Cornerstone Mask Ogerpon ex', 'Terapagos ex', 'Farigiraf ex']);
export const ANCIENT = new Set(['Raging Bolt ex', 'Walking Wake ex', 'Gouging Fire ex', 'Roaring Moon', 'Roaring Moon ex', 'Great Tusk', 'Scream Tail', 'Scream Tail ex', 'Flutter Mane', 'Brute Bonnet', 'Slither Wing', 'Sandy Shocks', 'Koraidon', 'Koraidon ex']);
export const isFuture = (name) => /^Iron /.test(name) || /^Miraidon/.test(name);

const stripParens = (s) => s.replace(/\([^)]*\)/g, ' ');
const sentences = (s) => stripParens(s ?? '').split(/(?<=[.!])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

// Converte um trecho em inglês ("your opponent's Basic Pokémon ex") num seletor.
export function parseSelector(ph) {
  const s = {};
  const p = stripParens(ph);
  if (/don.t have a rule box/i.test(p)) s.noRuleBox = true;
  else if (/rule box/i.test(p)) s.ruleBox = true;
  if (/\bbasic\b(?! energy)/i.test(p)) s.stage = 'Basic';
  if (/stage 2/i.test(p)) s.stage = 'Stage2';
  if (/stage 1/i.test(p)) s.stage = 'Stage1';
  if (/mega evolution/i.test(p)) s.mega = true;
  else if (/\bevolution pok/i.test(p)) s.evolved = true;
  if (/pok[eé]mon ex\b/i.test(p)) s.ex = true;
  if (/tera pok/i.test(p)) s.tera = true;
  if (/ancient pok/i.test(p)) s.ancient = true;
  if (/future pok/i.test(p)) s.future = true;
  if (/that have an ability|with an ability/i.test(p)) s.hasAbility = true;
  const non = [...p.matchAll(/non-\{([A-Z])\}/g)].map((m) => SYM[m[1]]);
  if (non.length) s.notTypes = non;
  const typed = p.replace(/non-\{[A-Z]\}/g, '').match(/((?:\{[A-Z]\}(?:,\s*(?:or\s+)?|\s+or\s+|\s*)?)+)\s*pok[eé]mon/i);
  if (typed) s.types = [...typed[1].matchAll(/\{([A-Z])\}/g)].map((m) => SYM[m[1]]);
  if (/special energy attached/i.test(p)) s.specialEnergy = true;
  const st = p.match(/\b(burned|poisoned|confused|asleep|paralyzed) pok[eé]mon/i);
  if (st) s.status = st[1].toLowerCase();
  // Qualificador que não sabemos ler → seletor "desconhecido" (nunca vira "qualquer Pokémon")
  if (/that ha(ve|s)|with any|that (is|are) /i.test(p) && !s.hasAbility && !s.specialEnergy && !s.noRuleBox && !/rule box/i.test(p)) s.unknown = true;
  const dmg = p.match(/damage is (\d+) or more/i);
  if (dmg) s.minDamage = +dmg[1];
  const dmgLe = p.match(/damage is (\d+) or less/i);
  if (dmgLe) s.maxDamageLE = +dmgLe[1];
  return s;
}

export function selectorIsEmpty(s) {
  return !Object.keys(s).length;
}

// Testa se uma carta do oponente casa com o seletor.
export function matches(sel, card, ctx = {}) {
  if (card.category !== 'Pokemon') return false;
  if (sel.stage && card.stage !== sel.stage) return false;
  if (sel.ex && !card.isEx) return false;
  if (sel.mega && !card.isMega) return false;
  if (sel.ruleBox && !card.isRuleBox) return false;
  if (sel.noRuleBox && card.isRuleBox) return false;
  if (sel.evolved && card.stage === 'Basic') return false;
  if (sel.tera && !TERA.has(card.name)) return false;
  if (sel.ancient && !ANCIENT.has(card.name)) return false;
  if (sel.future && !isFuture(card.name)) return false;
  if (sel.hasAbility && (!(card.abilities?.length) || ctx.lockedByMe?.has(card.name))) return false;
  if (sel.types && !(card.types ?? []).some((t) => sel.types.includes(t))) return false;
  if (sel.notTypes && (card.types ?? []).some((t) => sel.notTypes.includes(t))) return false;
  if (sel.minDamage && maxDamage(card) < sel.minDamage) return false;
  if (sel.unknown) return false;
  if (sel.maxDamageLE && maxDamage(card) > sel.maxDamageLE) return false;
  if (sel.specialEnergy && !ctx.oppSpecialEnergy) return false;
  if (sel.status && !ctx.myStatuses?.has(sel.status)) return false;
  return true;
}

// Estimativa do dano "típico" do melhor ataque da carta.
export function attackDamage(a) {
  const d = String(a.damage ?? '');
  const n = parseInt(d, 10) || 0;
  if (d.endsWith('+')) return n + 60;
  if (/[×x]$/.test(d)) return n * 3;
  if (n) return n;
  const m = (a.effect ?? '').match(/does (\d+) damage to/i);
  return m ? +m[1] : 0;
}
export function maxDamage(card) {
  return Math.max(0, ...(card.attacks ?? []).map(attackDamage));
}

// ---------- Tradução para PT-BR ----------
const TYPE_PT = { Grass: 'Planta', Fire: 'Fogo', Water: 'Água', Lightning: 'Elétrico', Psychic: 'Psíquico', Fighting: 'Lutador', Darkness: 'Escuridão', Metal: 'Metal', Dragon: 'Dragão', Colorless: 'Incolor', Fairy: 'Fada' };
export const typePt = (t) => TYPE_PT[t] ?? t;
export function selectorPt(s) {
  if (selectorIsEmpty(s)) return 'qualquer Pokémon';
  const parts = [];
  if (s.noRuleBox) parts.push('sem Rule Box');
  parts.unshift(s.mega ? 'Mega Pokémon ex' : s.ex ? 'Pokémon ex' : s.tera ? 'Pokémon Tera' : s.ruleBox ? 'Pokémon com Rule Box' : 'Pokémon');
  if (s.stage === 'Basic') parts.push('Básicos');
  if (s.stage === 'Stage1') parts.push('Estágio 1');
  if (s.stage === 'Stage2') parts.push('Estágio 2');
  if (s.evolved) parts.push('de Evolução');
  if (s.ancient) parts.push('Ancient');
  if (s.future) parts.push('Future');
  if (s.types) parts.push(`do tipo ${s.types.map(typePt).join('/')}`);
  if (s.notTypes) parts.push(`que não sejam ${s.notTypes.map(typePt).join('/')}`);
  if (s.hasAbility) parts.push('com Habilidade');
  if (s.minDamage) parts.push(`(quando o dano for ${s.minDamage}+)`);
  if (s.maxDamageLE) parts.push(`(só dano de até ${s.maxDamageLE})`);
  if (s.specialEnergy) parts.push('com Energia Especial');
  if (s.status) parts.push(`(${{ burned: 'Queimados', poisoned: 'Envenenados', confused: 'Confusos', asleep: 'Adormecidos', paralyzed: 'Paralisados' }[s.status]})`);
  // "Pokémon ex Básicos" soa melhor como "Pokémon Básicos ex"
  let out = parts.join(' ');
  out = out.replace('Pokémon ex Básicos', 'Pokémon Básicos ex').replace('Mega Pokémon ex Básicos', 'Mega Pokémon ex Básicos');
  return out;
}

// ---------- Extração das etiquetas ----------
// Cada etiqueta: { kind, sel, source: 'ability'|'attack'|'trainer', name, cost?, amount?, cond? }
export function extractTags(card) {
  const tags = [];
  const blocks = [];
  for (const a of card.abilities ?? []) blocks.push({ source: 'ability', name: a.name, text: a.effect ?? '' });
  for (const a of card.attacks ?? []) blocks.push({ source: 'attack', name: a.name, text: a.effect ?? '', cost: a.cost ?? [] });
  if (card.category !== 'Pokemon' && card.effect) blocks.push({ source: 'trainer', name: card.name, text: card.effect });

  for (const b of blocks) {
    const full = stripParens(b.text);
    const cond = [];
    if (/as long as this pok[eé]mon is in the active spot/i.test(full)) cond.push('active');
    if (/as long as this pok[eé]mon is on your bench/i.test(full)) cond.push('bench');
    if (/flip a coin/i.test(full)) cond.push('coin');
    const prize = full.match(/only if your opponent has (\d+) or fewer prize/i);
    if (prize) cond.push(`prizes<=${prize[1]}`);
    if (/only if any of your pok[eé]mon were knocked out/i.test(full)) cond.push('afterKO');
    if (/if your opponent.s pok[eé]mon is knocked out by damage from this attack/i.test(full)) cond.push('ifKO');
    const base = { source: b.source, name: b.name, cost: b.cost, cond };

    for (const s of sentences(b.text)) {
      // 1) Muralha: previne dano
      if (/prevent all damage/i.test(s) && !/damage counters/i.test(s)) {
        const after = s.split(/attacks/i).slice(1).join('attacks') || s;
        const sel = parseSelector(after.replace(/done to (this|that) pok[eé]mon/i, ''));
        delete sel.noRuleBox;
        if (/(is|are) on your bench|to your benched pok[eé]mon/i.test(s)) tags.push({ ...base, kind: 'BENCH_WALL', sel });
        else if (/this pok[eé]mon/i.test(s)) tags.push({ ...base, kind: 'WALL_SELF', sel });
        else if (/that pok[eé]mon/i.test(s)) tags.push({ ...base, kind: 'WALL_CHOSEN', sel });
        else {
          const protects = /don.t have a rule box/i.test(s) ? 'noRuleBox' : /future pok/i.test(s) ? 'future' : 'team';
          tags.push({ ...base, kind: 'WALL_TEAM', sel, protects });
        }
        continue;
      }
      // 2) Redução de dano
      const red = s.match(/takes? (\d+) less damage from attacks(?: from (?:your |the )?opponent.s ([^(]+?))?(?:\s*\(|$|\.)/i);
      if (red) {
        const sel = red[2] ? parseSelector(red[2]) : {};
        tags.push({ ...base, kind: 'REDUCE', sel, amount: +red[1] });
        continue;
      }
      // 3) Trava de habilidades
      if (/ha(ve|s) no abilities/i.test(s) && !/evolves from/i.test(s)) {
        const who = s.split(/ha(?:ve|s) no abilities/i)[0].replace(/as long as this pok[eé]mon is (in the active spot|on your bench),?/i, '');
        const sel = parseSelector(who.replace(/in play.*$/i, ''));
        const scope = /opponent.s active/i.test(who) ? 'oppActive' : /both yours and your opponent/i.test(s) || /in play/i.test(who) ? 'all' : 'opp';
        tags.push({ ...base, kind: 'ABILITY_LOCK', sel, scope });
        continue;
      }
      // 4) Trava de itens/ferramentas/supporters/estádios
      if (/can.t play any item cards/i.test(s)) tags.push({ ...base, kind: 'ITEM_LOCK', alsoTools: /tool/i.test(s) });
      if (/can.t play any supporter cards/i.test(s)) tags.push({ ...base, kind: 'SUPPORTER_LOCK' });
      // 5) Dano extra contra um tipo de alvo
      const more = s.match(/(\d+) more damage to your opponent.s active ([^(]+?)(?:\s*\(|$|\.)/i);
      if (more) {
        const sel = parseSelector(more[2]);
        if (!selectorIsEmpty(sel)) {
          const only = s.match(/used by the (.+?) this card is attached to/i);
          const needsNoRuleBox = /doesn.t have a rule box/i.test(s);
          tags.push({ ...base, kind: 'EXTRA_DMG', sel, amount: +more[1], onlyFor: only?.[1], needsNoRuleBox });
        }
      }
      // 6) Pune banco grande
      if (/for each (of your opponent.s )?benched pok[eé]mon|for each benched pok[eé]mon \(both|for each benched pok[eé]mon .both/i.test(s) && /damage/i.test(s)) {
        tags.push({ ...base, kind: 'BENCH_PUNISH' });
      }
      // 7) Ferramentas / energia especial / estádio / energia
      if (/discard[^.]*pok[eé]mon tools?[^.]*(opponent|in play)/i.test(s) || /discard all pok[eé]mon tools from your opponent/i.test(s)) tags.push({ ...base, kind: 'TOOL_HATE' });
      if (/special energy/i.test(s) && /(discard|knocked out|opponent)/i.test(s) && !/your special energy/i.test(s)) tags.push({ ...base, kind: 'SPECIAL_ENERGY_HATE' });
      if (/discard (a|the) stadium in play|discard a stadium/i.test(s)) tags.push({ ...base, kind: 'STADIUM_HATE' });
      if (/discard (an|\d+|up to \d+|all) energy from (your opponent|the defending|1 of your opponent|each of your opponent)/i.test(s)) tags.push({ ...base, kind: 'ENERGY_DISRUPT' });
      // 8) Corrida de prêmios: oponente pega menos / eu pego mais
      const fewer = s.match(/takes? (\d+) fewer prize/i);
      if (fewer) tags.push({ ...base, kind: 'PRIZE_DENIAL', amount: +fewer[1], once: /can.t be applied more than once/i.test(full) });
      // 9) Disrupção de mão
      if (/your opponent (shuffles|reveals) their hand/i.test(s) || /opponent shuffles their hand/i.test(s)) tags.push({ ...base, kind: 'HAND_DISRUPT' });
    }
  }
  // Estádios sempre "removem" o estádio do oponente ao serem jogados
  if (card.trainerType === 'Stadium' && !tags.some((t) => t.kind === 'STADIUM_HATE')) {
    tags.push({ source: 'trainer', name: card.name, kind: 'STADIUM_REPLACE', cond: [] });
  }
  // dedup
  const seen = new Set();
  return tags.filter((t) => {
    const k = `${t.kind}|${t.name}|${JSON.stringify(t.sel ?? {})}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
