import { loadDb } from '../src/db.js';
import { parseDeck } from '../src/parser.js';
import { readFileSync } from 'node:fs';
import * as F from '../test/fixtures.js';
const db = loadDb();
const text = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : F[process.env.DECK ?? 'SHARPEDO'];
const r = parseDeck(text, db);
for (const e of r.cards) console.log(String(e.count).padStart(2), e.card ? `${e.card.name} [${e.card.id}] ${e.card.category}${e.card.isRuleBox ? ' RULEBOX' : ''}${e.card.aceSpec ? ' ACE' : ''}` : `??? ${e.name}`);
console.log('total', r.total, '\nerros', r.errors, '\navisos', r.warnings);
