import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
const t0 = Date.now();
const r = analyze(readFileSync('test/decks/sharpedo.txt', 'utf8'), readFileSync('test/decks/basic-box.txt', 'utf8'), loadDb(), { limit: 6, context: 'corrida dos prêmios, morro em um hit para Ogerpon ou Folhas Férreas' });
console.log(`(${Date.now() - t0} ms)`);
for (const s of r.suggestions) {
  const c = s.consistency;
  console.log(`\n${s.card.name} (nota ${s.score}) — troca: ${s.swap.out.map((o) => `-${o.qty} ${o.name}`).join(' ')} → ${s.swap.in.join(' ')}`);
  if (c.setup) console.log(`   ${c.setup.label}: ${c.setup.before}% → ${c.setup.after}% (${c.setup.delta >= 0 ? '+' : ''}${c.setup.delta} pp)`);
  console.log(`   Supporter na mão inicial: ${c.supporter.before}% → ${c.supporter.after}% (${c.supporter.delta >= 0 ? '+' : ''}${c.supporter.delta} pp)`);
  console.log(`   ${c.tech.label}: ${c.tech.pct}% · peça presa nos prêmios: ${c.tech.prized}%`);
  console.log(`   custo de consistência: ${c.verdict}`);
}
