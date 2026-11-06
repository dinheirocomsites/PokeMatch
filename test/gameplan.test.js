// "Como ganhar este matchup": alvos prioritários conferidos pelo motor (quem derrubar primeiro e como).
// Caso do Felipe: Dragapult × Hydrapple — a melhor resposta é desmontar o combo (Meganium, linha Applin → Dipplin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
import { toJson } from '../src/serialize.js';
import { prepareStrategy } from '../src/strategist.js';
import { extractTags } from '../src/tags.js';

const db = loadDb();
const read = (n) => readFileSync(new URL(`./decks/${n}.txt`, import.meta.url), 'utf8');
const r = analyze(read('dragapult-felipe'), read('hydrapple'), db, { limit: 12 });
const t = (name) => r.gameplan.targets.find((x) => x.name === name);

test('alvos: a linha do Hydrapple ex e o Meganium (que dobra a energia) vêm primeiro', () => {
  assert.equal(r.gameplan.main, 'Hydrapple ex');
  const names = r.gameplan.targets.map((x) => x.name);
  assert.equal(names[0], 'Applin');
  assert.ok(names.slice(0, 3).includes('Meganium'), names.join(', '));
  assert.match(t('Meganium').why, /Wild Growth.*Syrup Storm/);
  assert.ok(toJson(r, db).gameplan.targets.length >= 4); // vai para a tela
});

test('como derrubar: dano espalhado + Munkidori no banco, sem gastar Boss; Ogerpon num ataque só (200 + 30)', () => {
  assert.match(t('Applin').how, /60 espalhados.*Phantom Dive.*sem precisar de Boss/);
  assert.match(t('Dipplin').how, /60 espalhados.*\+ 30 do Munkidori/);
  assert.match(t('Teal Mask Ogerpon ex').how, /= 230 e derruba num ataque só/);
});

test('Slowking: quem copia o Trifrost é o alvo nº 1 (e a cópia citada é o Trifrost, não o Thunder Raid)', () => {
  const r2 = analyze(read('sharpedo'), read('slowking'), db, { limit: 4 });
  assert.equal(r2.gameplan.targets[0].name, 'Slowking');
  assert.match(r2.gameplan.targets[0].why, /"Trifrost" do Kyurem \(110 em 3 Pokémon seus\)/);
});

test('a ficha da IA traz os alvos conferidos e pede o plano por fase', () => {
  const p = prepareStrategy({ myText: read('dragapult-felipe'), oppText: read('hydrapple'), db, r });
  assert.match(p.facts, /ALVOS PRIORITÁRIOS \(conferidos pelo motor; atacante principal dele: Hydrapple ex\)/);
  assert.match(p.facts, /\[Abertura\], \[Alvos\], \[Meio de jogo\], \[Fim de jogo\] ou \[Evitar\]/);
  assert.match(p.facts, /6 contadores = 60 somando todos os alvos/);
});

test('efeito que vale para os dois lados: Gravity Mountain (Estágio 2 de todo mundo −30) não é sugerido ao Dragapult', () => {
  const gm = (db.byName.get('gravity mountain') ?? [])[0];
  assert.equal(extractTags(gm).find((x) => x.kind === 'HP_DOWN').both, true);
  assert.ok(!r.suggestions.some((s) => s.card.name === 'Gravity Mountain'), r.suggestions.map((s) => s.card.name).join(', '));
});
