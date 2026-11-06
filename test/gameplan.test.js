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

test('conferência nas duas direções: afirmações sobre os SEUS ataques (copiadas da leitura real de 06/11)', async () => {
  const { verifyStrategy } = await import('../src/strategist.js');
  const p = prepareStrategy({ myText: read('dragapult-felipe'), oppText: read('hydrapple'), db, r });
  const c = (id, attacker, attack, target, text_pt) => ({ id, kind: 'ko', attacker, attack, target, text_pt });
  const s = { claims: [
    c('a', 'Hydrapple ex', 'Syrup Storm', 'Dragapult ex', 'Hydrapple ex nocauteia o Dragapult ex (320 HP) em 1 ataque.'),
    c('b', 'Dragapult ex', 'Phantom Dive', 'Applin', 'Os 60 espalhados no banco pelo Phantom Dive derrubam o Applin (40 HP).'),
    c('c', 'Dragapult ex', 'Phantom Dive', 'Meganium', 'Phantom Dive faz 200 no Ativo e derruba o Meganium (160 HP).'),
    c('d', 'Dragapult ex', 'Phantom Dive', 'Teal Mask Ogerpon ex', '200 do Phantom Dive + 30 do Adrena-Brain = 230, derruba o Teal Mask Ogerpon ex (210 HP).'),
    c('e', 'Dragapult ex', 'Phantom Dive', 'Dipplin', '60 espalhados + 30 do Munkidori derrubam o Dipplin (80 HP) no banco.'),
    c('f', 'Dragapult ex', 'Phantom Dive', 'Hydrapple ex', 'FALSA de propósito: Phantom Dive derruba o Hydrapple ex (330 HP).'),
    c('g', 'Dragapult ex', 'Phantom Dive', 'Bayleef', 'FALSA de propósito: só os 60 espalhados derrubam o Bayleef (110 HP).'),
  ] };
  const v = verifyStrategy(s, { me: p.me, opp: p.opp, r: p.r, db });
  const st = Object.fromEntries(v.claims.map((x) => [x.id, x.status]));
  for (const id of ['a', 'b', 'c', 'd', 'e']) assert.equal(st[id], 'ok', `${id}: ${v.claims.find((x) => x.id === id).check}`);
  assert.equal(st.f, 'erro'); // 200 não derruba 330
  assert.equal(st.g, 'erro', v.claims.find((x) => x.id === 'g').check); // "só os 60 espalhados" não derrubam 110
  assert.match(v.claims.find((x) => x.id === 'e').check, /60 espalhados no banco \+ 30 do Munkidori = 90 contra 80 HP → nocauteia/);
});
