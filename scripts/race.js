import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { simulateRace, planText } from '../src/prizes.js';
const db = loadDb();
const me = profileDeck(parseDeck(readFileSync('test/decks/sharpedo.txt', 'utf8'), db));
const opp = profileDeck(parseDeck(readFileSync('test/decks/basic-box.txt', 'utf8'), db));
console.log('Viabilidade dos atacantes do oponente:');
for (const e of opp.threat) if ((e.card.attacks ?? []).length) console.log(`  ${e.card.name.padEnd(28)} ${Math.round(e.feas * 100)}% ${e.feasMissing.map((m) => `falta ${m.type} (${m.have}/${m.need})`).join(' ')}`);
const main = me.mainAttacker.name;
for (const [label, opts] of [['SÓ Mega Sharpedo (plano ingênuo)', { only: [main] }], ['SEM tech, melhor ordem', {}], ['COM Legacy Energy no Mega Sharpedo', { denial: { name: 'Mega Sharpedo ex', amount: 1 } }]]) {
  const r = simulateRace(me, opp, opts);
  console.log(`\n== ${label}: ${r.best.win ? 'VITÓRIA' : 'derrota'} em ${r.best.turns} turnos (você ${r.best.myTaken} × ${r.best.oppTaken} ele) — pool: ${r.pool.join(', ')}`);
  planText(r.best).forEach((t) => console.log(`  T${t.turn}: ${t.mine}\n       ${t.theirs}`));
}
