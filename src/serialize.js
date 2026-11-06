// Converte o resultado da análise em JSON enxuto para a interface.
const slimCard = (c) => c && ({
  id: c.id, name: c.name, image: c.image ? `${c.image}/high.webp` : null, setCode: c.setCode, localId: c.localId,
  category: c.category, stage: c.stage, trainerType: c.trainerType, hp: c.hp, types: c.types, isEx: c.isEx, isMega: c.isMega,
});

export function toJson(r, db) {
  return {
    me: r.me, opp: r.opp, explain: r.explain, insights: r.insights, locked: r.locked, context: r.context, clusters: r.clusters, race: r.race,
    diagnosis: r.diagnosis, tips: r.tips, others: r.others, warnings: r.warnings ?? [], confidence: r.confidence ?? 'normal',
    already: r.already.map((a) => ({ card: slimCard(a.card), count: a.count, reasons: a.reasons.map((x) => x.why) })),
    suggestions: r.suggestions.map((s) => ({
      card: slimCard(s.card), score: s.score, impact: s.impact, fit: s.fit, parts: s.parts, slots: s.slots,
      reasons: s.reasons.map((x) => ({ kind: x.kind, why: x.why })), notes: s.notes,
      pkg: s.pkg && {
        adds: s.pkg.adds.map((a) => ({ qty: a.qty, role: a.role, card: slimCard(a.card) })),
        combos: s.pkg.combos.map((c) => c.text), unlocks: s.pkg.unlocks,
        damage: s.pkg.damage && { attack: s.pkg.damage.attack.name, base: s.pkg.damage.base, boost: s.pkg.damage.boost, passive: s.pkg.damage.passive, total: s.pkg.damage.total, kos: s.pkg.damage.kos, vs: s.pkg.damage.vs, notes: (s.pkg.damage.notes ?? []).filter((x) => !/envenenado/.test(x)) },
      },
      swap: s.swap, cluster: s.cluster, boosted: s.boosted, race: s.race, relevance: s.relevance, lowConfidence: s.lowConfidence, consistency: s.consistency, costs: s.costs,
    })),
    db: { syncedAt: db.syncedAt, marks: db.marks },
  };
}

