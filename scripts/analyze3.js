import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
const r = analyze(readFileSync('test/decks/sharpedo.txt', 'utf8'), readFileSync('test/decks/basic-box.txt', 'utf8'), loadDb(), { limit: 10, context: process.argv[2] ?? '' });
console.log('DIAGNÓSTICO:'); r.diagnosis.forEach((d) => console.log('  •', d));
console.log('\nCAMINHOS:'); r.clusters.forEach((c) => console.log(` ${c.icon} ${c.title}: ${c.items.map((i) => `${i.name} ${i.score}`).join(' | ')}`));
console.log('\nTOP (relevantes):'); r.suggestions.forEach((s, i) => console.log(` ${i + 1}. ${s.card.name} ${s.score} — ${s.relevance} ${JSON.stringify(s.parts)}`));
console.log('\nDESCARTADAS:'); r.others.forEach((o) => console.log(`  - ${o.name} ${o.score}`));
