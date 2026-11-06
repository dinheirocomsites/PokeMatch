import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { simulateRace, planText } from '../src/prizes.js';
const db = loadDb();
const me = profileDeck(parseDeck(readFileSync('test/decks/sharpedo.txt', 'utf8'), db));
for (const oppName of ['basic-box', 'dragapult']) {
  const opp = profileDeck(parseDeck(readFileSync(`test/decks/${oppName}.txt`, 'utf8'), db));
  for (const [label, opts] of [['só Sharpedo', { only: [me.mainAttacker.name] }], ['melhor ordem', {}]]) {
    const r = simulateRace(me, opp, opts);
    console.log(`\n=== ${oppName} · ${label}: ${r.best.win ? 'VITÓRIA' : 'derrota'} ${r.best.myTaken}×${r.best.oppTaken}`, label === 'melhor ordem' ? JSON.stringify({ cape: r.effects.oppCape, ruins: r.effects.ruins, hammer: r.effects.disruption.hammerBudget, stamp: r.effects.disruption.stampLeft, lock: r.effects.disruption.earlyLock }) : '');
    planText(r.best).forEach((t) => console.log(`  T${t.turn}: ${t.mine}\n       ${t.theirs}`));
  }
}
