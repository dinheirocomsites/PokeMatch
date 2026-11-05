// Perfil de um deck: de onde vem o poder de ataque, do que ele depende,
// fraquezas, tipos de energia, buscas disponíveis etc.
import { maxDamage, TERA, extractTags } from './tags.js';

export function threatOf(card) {
  const d = maxDamage(card);
  return d ? Math.max(0.2, d / 100) : 0.1;
}

// O deck consegue pagar o ataque? Compara o custo com as energias da lista.
// 0 = impossível, ~0.35 = só com a única cópia, 1 = tranquilo.
export function attackFeasibility(attack, deck) {
  const need = {};
  for (const t of attack.cost ?? []) if (t !== 'Colorless') need[t] = (need[t] ?? 0) + 1;
  let f = 1;
  const missing = [];
  for (const [t, n] of Object.entries(need)) {
    const avail = (deck.energyByType[t] ?? 0) + deck.anyEnergy;
    if (avail < n) { missing.push({ type: t, need: n, have: avail }); f = 0; continue; }
    const ratio = avail / n;
    f = Math.min(f, Math.min(1, 0.35 + 0.25 * (ratio - 1) + (deck.energySearch ? 0.15 : 0)));
  }
  return { f, missing };
}

export function profileDeck(parsed) {
  const entries = parsed.cards.filter((e) => e.card);
  const pokemon = entries.filter((e) => e.card.category === 'Pokemon');
  const trainers = entries.filter((e) => e.card.category === 'Trainer');
  const energy = entries.filter((e) => e.card.category === 'Energy');
  const sum = (arr, f = () => 1) => arr.reduce((s, e) => s + e.count * f(e.card), 0);

  // Energias por tipo (para saber quem consegue atacar de verdade)
  const energyByType = {};
  let anyEnergy = 0;
  for (const e of energy) {
    if (e.card.isBasicEnergy) { const t = e.card.name.replace(' Energy', ''); energyByType[t] = (energyByType[t] ?? 0) + e.count; }
    else if (/provides every type of energy/i.test(e.card.text)) anyEnergy += e.count;
    else for (const t of e.card.types ?? []) energyByType[t] = (energyByType[t] ?? 0) + e.count;
  }
  const energySearch = entries.some((e) => /search your deck for [^.]*basic energy/i.test(e.card.text));
  const eDeck = { energyByType, anyEnergy, energySearch };
  const threat = pokemon.map((e) => {
    const atks = (e.card.attacks ?? []).filter((a) => maxDamage({ attacks: [a] }) > 0);
    const feas = atks.length ? atks.map((a) => ({ a, ...attackFeasibility(a, eDeck) })).sort((x, y) => y.f - x.f)[0] : { f: 1, missing: [] };
    return { ...e, feas: feas.f, feasMissing: feas.missing, threat: e.count * threatOf(e.card) * (atks.length ? Math.max(feas.f, 0) : 1) };
  });
  const totalThreat = threat.reduce((s, e) => s + e.threat, 0) || 1;

  const weakness = {};
  for (const e of threat) for (const w of e.card.weaknesses ?? []) weakness[w.type] = (weakness[w.type] ?? 0) + e.threat / totalThreat;

  const energyTypes = new Set();
  for (const e of energy) {
    if (e.card.isBasicEnergy) energyTypes.add(e.card.name.replace(' Energy', ''));
    else for (const t of e.card.types ?? []) energyTypes.add(t);
  }

  const abilityPokemon = pokemon.filter((e) => e.card.abilities?.length);
  const has = (re) => trainers.some((e) => re.test(e.card.name));

  // Linha principal de ataque: maior (cópias × dano)
  const mainAttacker = [...threat].sort((a, b) => b.threat - a.threat)[0]?.card ?? null;

  // Buscas que o deck tem
  const search = {
    any: entries.some((e) => /search your deck for (a|up to \d+) pok[eé]mon(?! that doesn)(,|\s|\.)/i.test(e.card.text) && !/basic pok/i.test(e.card.text)),
    nonRuleBox: entries.some((e) => /pok[eé]mon that doesn.t have a rule box/i.test(e.card.text)),
    basic: entries.some((e) => /search your deck for up to \d+ basic pok[eé]mon/i.test(e.card.text)),
    basicLowHp: entries.some((e) => /basic pok[eé]mon with (\d+) hp or less/i.test(e.card.text)),
    evolution: entries.some((e) => /evolution pok[eé]mon/i.test(e.card.text) && /search/i.test(e.card.text)),
    trainer: entries.some((e) => /search your deck for a trainer card/i.test(e.card.text)),
    rareCandy: has(/^Rare Candy$/),
  };

  // Quem fica no banco durante o jogo: Pokémon de habilidade que funciona no banco + reserva do atacante principal
  const benchEngine = pokemon.filter((e) => e.card !== mainAttacker && (e.card.abilities ?? []).some((a) => !/in the active spot|when you play this pok[eé]mon from your hand/i.test(a.effect ?? ''))).map((e) => e.card.name);
  const backup = mainAttacker?.evolveFrom ?? (mainAttacker ? mainAttacker.name : null);
  const board = { pieces: [...new Set(benchEngine)], backup, benchNeeded: new Set(benchEngine).size + (backup ? 1 : 0) };

  return {
    board,
    total: parsed.total,
    counts: {
      pokemon: sum(pokemon), trainer: sum(trainers), energy: sum(energy),
      basic: sum(pokemon.filter((e) => e.card.stage === 'Basic')),
      stage1: sum(pokemon.filter((e) => e.card.stage === 'Stage1')),
      stage2: sum(pokemon.filter((e) => e.card.stage === 'Stage2')),
      ex: sum(pokemon.filter((e) => e.card.isEx)),
      mega: sum(pokemon.filter((e) => e.card.isMega)),
      ruleBox: sum(pokemon.filter((e) => e.card.isRuleBox)),
      tera: sum(pokemon.filter((e) => TERA.has(e.card.name))),
      withAbility: sum(abilityPokemon),
      item: sum(trainers.filter((e) => e.card.trainerType === 'Item')),
      tool: sum(trainers.filter((e) => e.card.trainerType === 'Tool')),
      supporter: sum(trainers.filter((e) => e.card.trainerType === 'Supporter')),
      stadium: sum(trainers.filter((e) => e.card.trainerType === 'Stadium')),
      specialEnergy: sum(energy.filter((e) => e.card.isSpecialEnergy)),
      basicEnergy: sum(energy.filter((e) => e.card.isBasicEnergy)),
    },
    threat,
    totalThreat,
    weakness,
    energyTypes,
    energyByType,
    anyEnergy,
    energySearch,
    mainAttacker,
    search,
    aceSpec: entries.find((e) => e.card.aceSpec)?.card ?? null,
    bigBench: trainers.some((e) => /up to 8 pok[eé]mon on their bench/i.test(e.card.text)),
    stadiums: trainers.filter((e) => e.card.trainerType === 'Stadium'),
    names: new Set(entries.map((e) => e.card.name)),
    entries,
    tagsByCard: entries.map((e) => ({ entry: e, tags: extractTags(e.card) })),
  };
}
