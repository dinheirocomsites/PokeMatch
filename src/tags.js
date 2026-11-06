// Classificador de mecânicas: lê o texto (inglês) de habilidades, ataques e
// treinadores e extrai "etiquetas de counter" estruturadas, incluindo QUEM é
// afetado (seletor). Ex.: Farigiraf ex → WALL_SELF { stage: Basic, ex: true }.

const SYM = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless', Y: 'Fairy' };

// Listas curadas para traços que a API não informa.
export const TERA = new Set(['Teal Mask Ogerpon ex', 'Hearthflame Mask Ogerpon ex', 'Wellspring Mask Ogerpon ex', 'Cornerstone Mask Ogerpon ex', 'Terapagos ex', 'Farigiraf ex']);
export const ANCIENT = new Set(['Raging Bolt ex', 'Walking Wake ex', 'Gouging Fire ex', 'Roaring Moon', 'Roaring Moon ex', 'Great Tusk', 'Scream Tail', 'Scream Tail ex', 'Flutter Mane', 'Brute Bonnet', 'Slither Wing', 'Sandy Shocks', 'Koraidon', 'Koraidon ex']);
export const FUTURE = new Set();
export const isFuture = (name) => (FUTURE.size ? FUTURE.has(name) : /^Iron /.test(name) || /^Miraidon/.test(name));
// Substitui as listas manuais pelos subtipos oficiais quando a base os traz
export function setTraits(traits) {
  if (traits.tera?.length) { TERA.clear(); traits.tera.forEach((n) => TERA.add(n)); }
  if (traits.ancient?.length) { ANCIENT.clear(); traits.ancient.forEach((n) => ANCIENT.add(n)); }
  if (traits.future?.length) { FUTURE.clear(); traits.future.forEach((n) => FUTURE.add(n)); }
}

const stripParens = (s) => s.replace(/\([^)]*\)/g, ' ');
const sentences = (s) => stripParens(s ?? '').split(/(?<=[.!])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

// "Pokémon de Treinador": o dono vem do nome ("N's Zoroark ex" → N; "Team Rocket's Mewtwo ex" → Team Rocket)
const OWNER_RE = /(Team Rocket|N|Hop|Ethan|Cynthia|Marnie|Larry|Steven|Erika|Misty|Iono|Arven|Lillie)'s/;
export function ownerOf(card) {
  if (!card || card.category !== 'Pokemon') return null;
  const m = card.name.replace(/[’]/g, "'").match(/^(Team Rocket|[A-Z][a-zA-Z.]*)'s /);
  return m ? m[1] : null;
}
// Donos citados no texto como "Pokémon de X" ("your Benched N's Pokémon", "Basic Hop's Pokémon")
export function ownerRefs(text) {
  return [...new Set([...(text ?? '').replace(/[’]/g, "'").matchAll(/(Team Rocket|N|Hop|Ethan|Cynthia|Marnie|Larry|Steven|Erika|Misty|Iono|Arven|Lillie)'s pok[eé]mon/gi)].map((m) => m[1]))];
}
// Busca restrita a Pokémon de um Treinador ("Search your deck for up to 2 Basic Hop's Pokémon") → [{owner, stage}]
export function ownerSearches(text) {
  const t = (text ?? '').replace(/[’]/g, "'");
  return [...t.matchAll(new RegExp(`search (?:your|their) deck for (?:a|an|any number of|up to \\d+)(?: in any combination of)? (basic |evolution )?${OWNER_RE.source} pok[eé]mon`, 'gi'))]
    .map((m) => ({ owner: m[2], stage: m[1]?.trim().toLowerCase() || null }));
}
export function ownerSearchFinds(searches, c) {
  return c?.category === 'Pokemon' && searches.some((s) => s.owner === c.owner && (!s.stage || (s.stage === 'basic' ? c.stage === 'Basic' : c.stage !== 'Basic')));
}
// Ataque que copia ataques do banco ("Choose 1 of your Benched N's Pokémon's attacks and use it as this attack")
export function copyAttackOf(attack) {
  const m = (attack?.effect ?? '').replace(/[’]/g, "'").match(new RegExp(`choose 1 of your benched (?:${OWNER_RE.source} )?pok[eé]mon's attacks and use it as this attack`, 'i'));
  return m ? { owner: m[1] ?? null } : null;
}
// Nomes em português dos donos (para explicar e para o leitor de contexto)
export const OWNER_PT = { 'Team Rocket': 'Equipe Rocket', N: 'N', Hop: 'Lupo (Hop)', Ethan: 'Ethan', Cynthia: 'Cíntia', Marnie: 'Marine', Larry: 'Lauro', Steven: 'Steven', Erika: 'Érica', Misty: 'Misty', Iono: 'Kissera (Iono)', Arven: 'Arven', Lillie: 'Lílian' };

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
  const own = p.replace(/[’]/g, "'").match(new RegExp(`${OWNER_RE.source} pok[eé]mon`, 'i'));
  if (own) s.owner = own[1];
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
  if (sel.owner && ownerOf(card) !== sel.owner) return false;
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
  if (s.owner) parts.push(`de ${OWNER_PT[s.owner] ?? s.owner}`);
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
      const red = s.match(/takes? (\d+) less damage from attacks(?: from (?:your |the )?opponent.s ([^(]+?))?(?:\s*\(|\s*$|\s*\.)/i)
        || (/as long as this pok[eé]mon is in the active spot/i.test(s) && s.match(/attacks used by your opponent.s active pok[eé]mon do (\d+) less damage()/i));
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
      // 5b) Bônus de grupo por dono ("Attacks used by your Hop's Pokémon do 30 more damage…")
      const grp = s.replace(/[’]/g, "'").match(new RegExp(`attacks used by (?:your |the )?(?:${OWNER_RE.source}) pok[eé]mon(?: this card is attached to)?[^.]*?do (\\d+) more damage`, 'i'));
      // vira EXTRA_DMG restrito ao dono (ownerFor); "both yours and your opponent's" = o oponente também ganha
      if (grp) tags.push({ ...base, kind: 'EXTRA_DMG', sel: {}, amount: +grp[2], ownerFor: grp[1], attached: /this card is attached to/i.test(s), both: /both yours|both players/i.test(b.text) });
      // 5c) Trava de Pokémon com Habilidade vindos da mão (Team Rocket's Arbok)
      const pl = s.replace(/[’]/g, "'").match(/your opponent can't play any pok[eé]mon that has an ability from their hand(?:, except for (team rocket|[a-z.]+)'s pok[eé]mon)?/i);
      if (pl) tags.push({ ...base, kind: 'HAND_PKMN_LOCK', exceptOwner: pl[1] ? (pl[1].toLowerCase() === 'team rocket' ? 'Team Rocket' : pl[1]) : null });
      // 6) Pune banco grande
      if (/for each (of your opponent.s )?benched pok[eé]mon|for each benched pok[eé]mon \(both|for each benched pok[eé]mon .both/i.test(s) && /damage/i.test(s)) {
        tags.push({ ...base, kind: 'BENCH_PUNISH' });
      }
      // 7) Ferramentas / energia especial / estádio / energia
      if (/discard[^.]*pok[eé]mon tools?[^.]*(opponent|in play)/i.test(s) || /discard all pok[eé]mon tools from your opponent/i.test(s)) tags.push({ ...base, kind: 'TOOL_HATE' });
      if (/special energy/i.test(s) && /(discard|knocked out|opponent)/i.test(s) && !/your special energy/i.test(s)) tags.push({ ...base, kind: 'SPECIAL_ENERGY_HATE' });
      if (/discard (a|the) stadium in play|discard a stadium/i.test(s)) tags.push({ ...base, kind: 'STADIUM_HATE' });
      if (/discard (an|\d+|up to \d+|all) energy from (your opponent|the defending|1 of your opponent|each of your opponent)/i.test(s) || /put (an|\d+) energy attached to (1 of )?your opponent.s (active )?(stage \d )?pok[eé]mon into their hand/i.test(s)) tags.push({ ...base, kind: 'ENERGY_DISRUPT' });
      // 8) Corrida de prêmios: oponente pega menos / eu pego mais
      const fewer = s.match(/takes? (\d+) fewer prize/i);
      if (fewer) tags.push({ ...base, kind: 'PRIZE_DENIAL', amount: +fewer[1], once: /can.t be applied more than once/i.test(full) });
      // 9) Disrupção de mão
      if (/your opponent (shuffles|reveals) their hand/i.test(s) || /opponent shuffles their hand/i.test(s) || /discard (a random card|\d+ cards?) from your opponent.s hand|your opponent discards (a|\d+) cards?|choose a random card from your opponent.s hand/i.test(s)) tags.push({ ...base, kind: 'HAND_DISRUPT' });
      // 10) Condições especiais no Ativo do oponente
      const st = s.match(/your opponent.s active pok[eé]mon is now (asleep|paralyzed|confused|burned|poisoned)/i) || s.match(/the defending pok[eé]mon is now (asleep|paralyzed|confused|burned|poisoned)/i)
        || s.match(/make your opponent.s active pok[eé]mon (asleep|paralyzed|confused|burned|poisoned)/i) || s.match(/both active (?:non-\{[A-Z]\} )?pok[eé]mon are now (asleep|paralyzed|confused|burned|poisoned)/i)
        || (/your opponent.s active pok[eé]mon is now affected by that special condition/i.test(s) && [null, 'poisoned'])
        || (/if the defending pok[eé]mon tries to use an attack, your opponent flips a coin/i.test(s) && [null, 'smokescreen']);
      if (st) tags.push({ ...base, kind: 'STATUS', status: st[1].toLowerCase() });
      // 11) Desvantagem do próprio ataque
      if (b.source === 'attack' && (/during your next turn, this pok[eé]mon can.t (attack|use)/i.test(s) || (/discard (all|\d+|an?) (basic )?(\{[a-z]\} )?energy from this pok[eé]mon|put (an|\d+) (\{[a-z]\} )?energy attached to this pok[eé]mon into your hand/i.test(s) && !/you may/i.test(s)) || /this pok[eé]mon takes \d+ more damage/i.test(s) || /this pok[eé]mon also does \d+ damage to itself/i.test(s))) {
        tags.push({ ...base, kind: 'DRAWBACK', what: /can.t (attack|use)/i.test(s) ? 'noAttack' : /discard/i.test(s) ? 'discardEnergy' : /takes/i.test(s) ? 'takesMore' : 'selfDamage' });
      }
      // 12) Cura
      const heal = s.match(/heal (\d+|all) damage from (1 of your|each of your|this|your active|all of your)/i);
      if (heal) tags.push({ ...base, kind: 'HEAL', amount: heal[1] === 'all' ? 999 : +heal[1], scope: /each of your|all of your/i.test(heal[2]) ? 'all' : 'one' });
      // 13) Troca/recuo dos seus Pokémon e prender o do oponente
      if (/switch (your active pok[eé]mon|this pok[eé]mon) with 1 of your benched/i.test(s) || /your (basic )?pok[eé]mon in play have no retreat cost|retreat cost (of the pok[eé]mon this card is attached to )?is .*less|has no retreat cost/i.test(s)) tags.push({ ...base, kind: 'SWITCH' });
      if (/the defending pok[eé]mon can.t retreat|your opponent.s active pok[eé]mon can.t retreat|during your opponent.s next turn, that pok[eé]mon can.t retreat/i.test(s)) tags.push({ ...base, kind: 'TRAP' });
      // 14) Mover energia entre os seus Pokémon
      if (/move (a|an|up to \d+|any amount of|all) (basic )?(\{[a-z]\} )?energy from (1 of )?(your|this pok[eé]mon)/i.test(s)) tags.push({ ...base, kind: 'ENERGY_MOVE' });
      // 15) Colocar contadores de dano no oponente (fora "mover")
      const pc = s.match(/put (\d+) damage counters? on (1 of )?your opponent.s (pok[eé]mon|benched pok[eé]mon|active pok[eé]mon)/i) || s.match(/place (\d+) damage counters? on (1 of )?your opponent.s (pok[eé]mon|benched pok[eé]mon|active pok[eé]mon)/i);
      if (pc && !/in any way you like/i.test(s)) tags.push({ ...base, kind: 'PLACE_COUNTERS', amount: +pc[1] * 10, where: pc[3].toLowerCase() });
      else if (pc) tags.push({ ...base, kind: 'PLACE_COUNTERS', amount: +pc[1] * 10, where: 'any', spread: true });
      // 17) Custo de ataque: "ataques de Pokémon X custam {C} a mais/menos"
      const cost = s.match(/attacks used by (?:each |your |your opponent.s )?(.+?) (?:in play )?(?:\([^)]*\) )?cost (\{[a-z]\}|\d+ energy|1 energy) (more|less)/i)
        || s.match(/when the (.+?) this card is attached to uses an attack, that attack costs (\d+|1) energy (more|less)/i);
      if (cost) {
        const who = cost[1].replace(/\(both yours and your opponent.s\)/i, '');
        tags.push({ ...base, kind: 'COST_CHANGE', sel: parseSelector(who), delta: cost[3].toLowerCase() === 'more' ? 1 : -1, both: /both yours and your opponent/i.test(s), mine: /this card is attached to|your pok/i.test(s) && !/opponent/i.test(s) });
      }
      // 18) HP reduzido: "cada Pokémon Estágio 2 em jogo recebe -30 HP"
      const hpd = s.match(/each (.+?) in play[^.]*gets -(\d+) hp/i) || s.match(/your opponent.s (.+?) gets? -(\d+) hp/i);
      if (hpd) tags.push({ ...base, kind: 'HP_DOWN', sel: parseSelector(hpd[1]), amount: +hpd[2], both: /both yours and your opponent/i.test(s) });
      // 16) HP extra (Ferramenta)
      const hpb = s.match(/gets \+(\d+) hp/i);
      if (hpb) tags.push({ ...base, kind: 'HP_BOOST', amount: +hpb[1] });
      // 17) Retaliação: quem ataca este Pokémon leva contadores ("put 3 damage counters on the Attacking Pokémon")
      const ret = s.match(/(?:is (?:damaged|knocked out) by (?:damage from )?an attack|damaged by an attack)[^,]*,\s*(?:put|place) (\d+) damage counters on the attacking pok[eé]mon/i);
      if (ret && !/flip a coin/i.test(full)) tags.push({ ...base, kind: 'RETALIATE', amount: +ret[1] * 10, whenKO: /knocked out/i.test(s), nextTurnOnly: /during your opponent.s next turn/i.test(s) });
      // 18) Aguenta o nocaute com HP cheio (fica com 10)
      if (/has full hp and would be knocked out by damage from an attack, it is not knocked out/i.test(s) && !/flip a coin/i.test(full)) tags.push({ ...base, kind: 'SURVIVE_FULL', hpLeft: +(s.match(/remaining hp becomes (\d+)/i)?.[1] ?? 10) });
      // 19) Tira o Ativo do oponente para o banco (ele escolhe o novo): quebra efeitos "enquanto estiver no Ativo"
      if (/switch out your opponent.s active pok[eé]mon to the bench/i.test(s) && !/flip a coin|if heads/i.test(s)) tags.push({ ...base, kind: 'FORCE_SWITCH' });
      // 20) Habilidade que nocauteia o próprio Pokémon (dá prêmio ao oponente)
      if (b.source === 'ability' && /if you use this ability, this pok[eé]mon is knocked out/i.test(s)) tags.push({ ...base, kind: 'SELF_KO' });
      // 21) Evolução do oponente: trava, pune ou desfaz
      if (/they can.t play any pok[eé]mon from their hand to evolve/i.test(s)) tags.push({ ...base, kind: 'EVOLVE_LOCK' });
      if (/whenever your opponent plays a pok[eé]mon from their hand to evolve[^.]*put (\d+) damage counters/i.test(s)) tags.push({ ...base, kind: 'EVOLVE_PUNISH', amount: +s.match(/put (\d+) damage counters/i)[1] * 10 });
      if (/devolve (1 of your opponent.s|each of your opponent.s|it)/i.test(s) && !/your evolved \{/i.test(s)) tags.push({ ...base, kind: 'DEVOLVE', all: /each of your opponent/i.test(s) });
      // 22b) Tira um Pokémon do oponente de jogo sem nocaute (embaralha no deck / volta para a mão): sem prêmio, mas some do tabuleiro
      if (/shuffle (that|1 of your opponent.s|your opponent.s active) pok[eé]mon and all attached cards into their deck|put (that|your opponent.s active) pok[eé]mon and all attached cards into (their|your opponent.s) hand/i.test(s)) tags.push({ ...base, kind: 'BOUNCE_OPP' });
      // 22) Trava de ligar energia / atacar com pouca energia no turno dele
      if (/energy can.t be attached from your opponent.s hand to the defending|if they attach an energy card from their hand to the defending pok[eé]mon, their turn ends|pok[eé]mon that have \d+ or less energy attached can.t attack|whenever (they|your opponent) attach(es)? an energy card from (their|the) hand[^.]*(put|place) \d+ damage counters/i.test(s)) tags.push({ ...base, kind: 'ATTACH_LOCK' });
    }
  }
  // Efeitos lidos pela IA (rodada 7), já conferidos pelo validador: só entram onde a regra não leu nada daquele tipo
  for (const it of card.llm ?? []) {
    const source = (card.abilities ?? []).some((a) => a.name === it.block) ? 'ability' : (card.attacks ?? []).some((a) => a.name === it.block) ? 'attack' : 'trainer';
    const atk = source === 'attack' ? card.attacks.find((a) => a.name === it.block) : null;
    for (const e of it.effects ?? []) {
      if (e.kind === 'NONE' || tags.some((t) => t.kind === e.kind && t.name === it.block)) continue;
      const t = { source, name: it.block, cost: atk?.cost ?? [], cond: e.cond ?? [], kind: e.kind, via: 'ia', summary: it.summary };
      if (e.amount) t.amount = e.amount;
      if (e.status) t.status = e.status;
      if (e.kind === 'HEAL') t.scope = e.scope === 'all' ? 'all' : 'one';
      if (e.kind === 'PLACE_COUNTERS') t.where = e.scope === 'bench' ? 'benched pokémon' : e.scope === 'active' ? 'active pokémon' : 'pokémon';
      if (e.kind === 'DRAWBACK') t.what = 'other';
      if (['EXTRA_DMG', 'REDUCE', 'WALL_SELF', 'ABILITY_LOCK'].includes(e.kind)) { const sel = e.target ? parseSelector(e.target) : {}; t.sel = sel.unknown ? {} : sel; }
      // A QUEM o bônus se aplica (o motor confere no texto, não confia na resposta):
      //   "attacks used by this Pokémon" → só a própria carta; "attacks used by your {G} Pokémon and {R} Pokémon" → só esses tipos
      if (e.kind === 'EXTRA_DMG') {
        const sx = (it.sentence ?? '').replace(/[’]/g, "'");
        if (/attacks used by this pok[eé]mon|this attack does/i.test(sx) || !/attacks used by (your|the pok[eé]mon this card is attached to|each of your)/i.test(sx)) t.onlyFor = card.name;
        const types = [...sx.matchAll(/\{([A-Z])\}/g)].map((m) => ({ G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless' }[m[1]])).filter(Boolean);
        if (!t.onlyFor && /attacks used by your [^.]*\{[A-Z]\}/i.test(sx) && types.length) t.typeFor = [...new Set(types)];
        if (/attached to/i.test(sx) && !t.onlyFor) t.attached = true;
      }
      tags.push(t);
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
