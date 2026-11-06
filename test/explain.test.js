// "Como entendemos o seu deck" (tela de espera): o resumo tem que bater com a mecânica real do deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
import { toJson } from '../src/serialize.js';
import { prepareStrategy } from '../src/strategist.js';

const db = loadDb();
const read = (n) => readFileSync(new URL(`./decks/${n}.txt`, import.meta.url), 'utf8');
const plain = (rows) => rows.map((x) => `${x.label}: ${x.text.replace(/<\/?b>/g, '')}`).join('\n');

test('Sharpedo: Hungry Jaws com contador (Carvanha/Toxtricity), 340 com Mochi envenenado (Pecharunt) + Munkidori', () => {
  const r = analyze(read('sharpedo'), read('slowking'), db, { limit: 4 });
  const t = plain(r.explain.mine);
  assert.match(t, /atacante principal: Mega Sharpedo ex/);
  assert.match(t, /"Hungry Jaws" \{D\}\{D\}: o motor conta 270/);
  assert.match(t, /Carvanha \("Reckless Charge"\) e Toxtricity \("Sinister Surge"\)/);
  assert.match(t, /chega a 340: Binding Mochi \+40 \(com ele Envenenado: Pecharunt ex\) \+ Munkidori \+30/);
  assert.match(t, /Energia: 9 Escuridão; acelera energia com Toxtricity/);
  // e vai para a tela (JSON do site)
  assert.deepEqual(toJson(r, db).explain.mine.map((x) => x.label), r.explain.mine.map((x) => x.label));
});

test('Slowking (lado do oponente): o Trifrost copiado do Kyurem aparece como 110 em 3 Pokémon', () => {
  const r = analyze(read('sharpedo'), read('slowking'), db, { limit: 4 });
  const t = plain(r.explain.theirs);
  assert.match(t, /Slowking usa "Trifrost" do Kyurem pagando \{P\}\{C\} \(110 em 3 Pokémon\)/);
  assert.match(t, /210 em 1 Pokémon ex do banco/); // Thunder Raid só acerta ex
});

test('a revisão da IA reaproveita a análise já feita (sem rodar o motor duas vezes)', () => {
  const r = analyze(read('sharpedo'), read('sharpedo'), db, { limit: 12 });
  const prep = prepareStrategy({ myText: read('sharpedo'), oppText: read('sharpedo'), db, r });
  assert.equal(prep.r, r);
  assert.match(prep.facts, /REVISE AS SUGESTÕES DO MOTOR/);
});
