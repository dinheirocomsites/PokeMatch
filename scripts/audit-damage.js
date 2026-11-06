// Relatório de qualidade: quantos ataques legais a função de dano entende e quais frases ainda não.
import { loadDb } from '../src/db.js';
import { damageVs, unparsed } from '../src/damage.js';
const db = loadDb();
const target = { name: 'alvo', category: 'Pokemon', stage: 'Basic', hp: 220, isEx: true, isRuleBox: true, types: ['Colorless'], weaknesses: [], abilities: [] };
let total = 0, conditional = 0;
for (const c of db.unique) for (const a of c.attacks ?? []) {
  const d = String(a.damage ?? '');
  if (!/[+×x]$/.test(d)) continue;
  total++;
  const before = [...unparsed.values()].reduce((s, n) => s + n, 0);
  damageVs(a, c, target, { deck: { counts: { basic: 6 }, entries: [] } });
  if ([...unparsed.values()].reduce((s, n) => s + n, 0) === before) conditional++;
}
console.log(`Ataques com dano variável ("+" ou "×"): ${total}`);
console.log(`Entendidos: ${conditional} (${Math.round((conditional / total) * 100)}%) · Não entendidos: ${total - conditional}`);
console.log('\nFrases ainda não entendidas (mais comuns primeiro):');
[...unparsed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, n]) => console.log(`  ${n}× ${k}`));
