// Uso: node scripts/analyze.js <minha-lista.txt> <lista-oponente.txt>
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
const [, , mine = 'test/decks/sharpedo.txt', opp = 'test/decks/basic-box.txt'] = process.argv;
const r = analyze(readFileSync(mine, 'utf8'), readFileSync(opp, 'utf8'), loadDb(), { limit: 12 });
console.log('== Oponente:', r.opp.mainAttacker, '| fraquezas:', r.opp.weakness.map((w) => `${w.typePt} ${w.share}%`).join(', '));
r.insights.forEach((i) => console.log('  •', i));
console.log('\n== Você já tem:'); r.already.forEach((a) => console.log(`  ${a.count}x ${a.card.name}: ${a.reasons.map((x) => x.why).join(' / ')}`));
console.log('\n== Sugestões:');
r.suggestions.forEach((s, i) => {
  console.log(`\n${i + 1}. ${s.card.name} [${s.card.id}]  nota ${s.score} (impacto ${s.impact} × encaixe ${s.fit}%)`);
  s.reasons.slice(0, 2).forEach((x) => console.log('   ★', x.why));
  console.log(`    recursos ${s.parts.recursos} · peso ${s.parts.peso} · sinergia ${s.parts.sinergia} · risco ${s.parts.risco}`);
  for (const [k, ns] of Object.entries(s.notes)) ns.forEach((n) => console.log(`     [${k}] ${n}`));
  console.log('    TROCA:', s.swap.out.map((c) => `-${c.qty} ${c.name} (${c.why})`).join('; '), '→', s.swap.in.join(' '));
});
