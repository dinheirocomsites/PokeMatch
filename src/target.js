// ALVO de um efeito: em QUEM ele age e ONDE. ("Heal 60 damage from your Active {N} Pokémon" → seu Ativo, só Dragão.)
// Erro que isto evita: guardar "cura 60" e esquecer "Ativo" + "{N}" — e aí sugerir Dragon Elixir contra dano no banco
// num deck que quase não tem Dragão. Todo efeito de apoio/defesa leva um alvo; todo uso do efeito confere o alvo.
const SYMT = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', N: 'Dragon', C: 'Colorless' };
const TYPE_PT = { Grass: 'Planta', Fire: 'Fogo', Water: 'Água', Lightning: 'Elétrico', Psychic: 'Psíquico', Fighting: 'Lutador', Darkness: 'Escuridão', Metal: 'Metal', Dragon: 'Dragão', Colorless: 'Incolor' };
const OWNERS = "team rocket|n|hop|ethan|cynthia|marnie|larry|steven|erika|misty|iono|arven|lillie";

// Lê o alvo de uma frase (só do SEU lado). Devolve null se a frase não diz em quem age.
export function parseTarget(sentence) {
  const s = String(sentence ?? '').replace(/[’]/g, "'").replace(/\([^)]*\)/g, ' ');
  const QUAL = `((?:(?:basic|evolution|stage 1|stage 2|benched|active|${OWNERS})(?:'s)? |\\{[a-z]\\} (?:pok[eé]mon (?:and|or) )?)*)pok[eé]mon( ex)?( that (?:doesn't|don't) have a rule box)?`;
  const pats = [
    { re: /\bthis pok[eé]mon\b/i, where: 'self' },
    { re: new RegExp(`\\bthe ((?:\\{[a-z]\\} |(?:${OWNERS})'s |basic |evolution |stage 1 |stage 2 )*)pok[eé]mon( ex)? this card is attached to\\b`, 'i'), where: 'attached' },
    { re: new RegExp(`\\byour active ${QUAL}`, 'i'), where: 'active' },
    { re: new RegExp(`\\b(1|2|each|all) of your benched ${QUAL}`, 'i'), where: 'bench' },
    { re: new RegExp(`\\byour benched ${QUAL}`, 'i'), where: 'bench' },
    { re: new RegExp(`\\b(1|2|each|all) of your ${QUAL}`, 'i'), where: 'any' },
    { re: new RegExp(`\\byour ${QUAL}`, 'i'), where: 'any' },
  ];
  // o PRIMEIRO alvo do seu lado que aparece na frase (o que vem depois de "opponent's" é do oponente)
  let best = null;
  for (const p of pats) {
    const re = new RegExp(p.re.source, 'gi');
    let m;
    while ((m = re.exec(s))) {
      if (/opponent's\s*$/i.test(s.slice(Math.max(0, m.index - 12), m.index))) continue;
      if (!best || m.index < best.idx) best = { idx: m.index, m, where: p.where };
      break;
    }
  }
  if (!best) return null;
  const phrase = best.m[0];
  const types = [...phrase.matchAll(/\{([a-z])\}/gi)].map((x) => SYMT[x[1].toUpperCase()]).filter(Boolean);
  const own = phrase.match(new RegExp(`(${OWNERS})'s`, 'i'));
  const ownerName = own ? (own[1].toLowerCase() === 'team rocket' ? 'Team Rocket' : own[1][0].toUpperCase() + own[1].slice(1).toLowerCase()) : null;
  return {
    where: best.where,
    all: /\b(each|all) of\b/i.test(phrase),
    types,
    stage: /\bbasic\b/i.test(phrase) ? 'Basic' : /stage 1/i.test(phrase) ? 'Stage1' : /stage 2/i.test(phrase) ? 'Stage2' : /evolution/i.test(phrase) ? 'Evolution' : null,
    noRuleBox: /rule box/i.test(phrase),
    exOnly: / ex\b/i.test(phrase) && !/rule box/i.test(phrase),
    owner: ownerName === 'N' ? 'N' : ownerName,
    phrase: phrase.trim(),
  };
}

// O alvo restringe QUAIS Pokémon? (tipo, estágio, Rule Box, dono)
export const restricts = (t) => !!t && (t.types.length > 0 || !!t.stage || t.noRuleBox || t.exOnly || !!t.owner);
export function matchesTarget(t, card) {
  if (!t || card?.category !== 'Pokemon') return false;
  if (t.types.length && !(card.types ?? []).some((x) => t.types.includes(x))) return false;
  if (t.stage === 'Basic' && card.stage !== 'Basic') return false;
  if (t.stage === 'Stage1' && card.stage !== 'Stage1') return false;
  if (t.stage === 'Stage2' && card.stage !== 'Stage2') return false;
  if (t.stage === 'Evolution' && (!card.stage || card.stage === 'Basic')) return false;
  if (t.noRuleBox && card.isRuleBox) return false;
  if (t.exOnly && !card.isEx) return false;
  if (t.owner && card.owner !== t.owner) return false;
  return true;
}
export function describeTarget(t) {
  if (!t) return 'qualquer Pokémon';
  const parts = [];
  if (t.stage) parts.push({ Basic: 'Básico', Stage1: 'Estágio 1', Stage2: 'Estágio 2', Evolution: 'Evolução' }[t.stage]);
  parts.push('Pokémon');
  if (t.types.length) parts.push(t.types.map((x) => TYPE_PT[x] ?? x).join('/'));
  if (t.exOnly) parts.push('ex');
  if (t.noRuleBox) parts.push('sem Rule Box');
  if (t.owner) parts.push(`de ${t.owner}`);
  const where = { active: ' no Ativo', bench: ' no banco', self: ' (só ele mesmo)', attached: ' (o que tiver a carta)', any: '' }[t.where] ?? '';
  return `${parts.join(' ')}${where}`;
}

// Quais Pokémon do SEU deck o efeito alcança, para um propósito:
//   'bench'  → proteger/curar o banco (precisa alcançar o banco)
//   'active' → manter o atacante vivo / tirar do Ativo (precisa alcançar quem fica no Ativo)
export function targetCoverage(t, me, purpose, selfCard = null) {
  const mine = me.entries.filter((e) => e.card.category === 'Pokemon').map((e) => e.card);
  const attackers = new Set(me.threat.filter((e) => e.feas >= 0.3 && (e.card.attacks ?? []).some((a) => /\d/.test(String(a.damage ?? '')))).map((e) => e.card.name));
  if (me.mainAttacker) attackers.add(me.mainAttacker.name);
  const bench = new Set([...(me.board?.pieces ?? []), me.board?.backup, ...mine.filter((c) => c.stage === 'Basic').map((c) => c.name)].filter(Boolean));
  if (!t) return { ok: true, covered: [], frac: 1, reason: '' };
  if (t.where === 'self') {
    const ok = selfCard && (purpose === 'active' ? true : true);
    return { ok: !!ok, covered: selfCard ? [selfCard.name] : [], frac: 0.3, reason: 'só protege/afeta a própria carta' };
  }
  const reachBench = ['bench', 'any', 'attached'].includes(t.where);
  const reachActive = ['active', 'any', 'attached'].includes(t.where);
  if (purpose === 'bench' && !reachBench) return { ok: false, covered: [], frac: 0, reason: `só age no ${t.where === 'active' ? 'Ativo' : 'próprio Pokémon'}, não no banco` };
  if (purpose === 'active' && !reachActive) return { ok: false, covered: [], frac: 0, reason: 'só age no banco, não no Ativo' };
  const pool = mine.filter((c) => (purpose === 'bench' ? bench.has(c.name) : attackers.has(c.name)) && matchesTarget(t, c));
  const base = mine.filter((c) => (purpose === 'bench' ? bench.has(c.name) : attackers.has(c.name)));
  const covered = [...new Set(pool.map((c) => c.name))];
  const frac = covered.length / Math.max(1, new Set(base.map((c) => c.name)).size);
  const reason = covered.length ? '' : `só alcança ${describeTarget(t)} e nenhum dos seus ${purpose === 'bench' ? 'Pokémon de banco' : 'atacantes'} é assim`;
  return { ok: covered.length > 0, covered, frac, reason };
}
