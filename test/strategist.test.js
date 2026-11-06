// Estrategista (passo 3): a conferência do motor sobre as afirmações da IA.
// ATENÇÃO: a "resposta da IA" abaixo é uma FIXTURE escrita à mão (com acertos E erros de propósito).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { analyze } from '../src/engine.js';
import { parseDeck } from '../src/parser.js';
import { profileDeck } from '../src/profile.js';
import { buildFacts, verifyStrategy, STRATEGY_SCHEMA, runStrategist } from '../src/strategist.js';

const db = loadDb();
const read = (f) => readFileSync(new URL(`./decks/${f}`, import.meta.url), 'utf8');
const PAIN = 'Morro para o kyurem e depois nao volto mais';
const myText = read('sharpedo.txt'), oppText = read('slowking.txt');
const me = profileDeck(parseDeck(myText, db));
const opp = profileDeck(parseDeck(oppText, db));
const r = analyze(myText, oppText, db, { limit: 12, context: PAIN });

const FIXTURE = {
  opponent_plan: { summary_pt: 'x', damage_sources: [], enablers: ['Academy at Night'], key_turns_pt: '' },
  my_problem: { summary_pt: 'x', mechanism_pt: 'x' },
  claims: [
    { id: 'c1', kind: 'ko', attacker: 'Slowking', attack: 'Trifrost', target: 'Carvanha', text_pt: 'certo' },
    { id: 'c2', kind: 'ko', attacker: 'Kyurem', attack: 'Trifrost', target: 'Carvanha', text_pt: 'errado: o Kyurem sozinho não paga' },
    { id: 'c3', kind: 'can_attack', attacker: 'Slowking', attack: 'Trifrost', target: '', text_pt: 'certo' },
    { id: 'c4', kind: 'in_deck', attacker: 'Academy at Night', attack: '', target: '', text_pt: 'certo' },
    { id: 'c5', kind: 'ko', attacker: 'Mega Kangaskhan ex', attack: 'Rapid-Fire Combo', target: 'Mega Sharpedo ex', text_pt: 'errado: não fecha 330' },
    { id: 'c6', kind: 'ko', attacker: 'Gardevoir ex', attack: 'Miracle Force', target: 'Carvanha', text_pt: 'carta que não está na lista' },
  ],
  tech_ideas: [
    { card: 'Shaymin', why_pt: 'protege o banco', answers: ['c1'] },
    { card: 'Carvanha', why_pt: 'já joga', answers: [] },
    { card: 'Carta Inventada ex', why_pt: 'não existe', answers: [] },
  ],
  play_tips_pt: [],
  disagreements: [
    { text_pt: 'Farigiraf só bloqueia Tera (inventado)', card: 'Farigiraf ex', quote: "by attacks from your opponent's Tera Pokémon" },
    { text_pt: 'Acerola só no fim do jogo (verdade)', card: "Acerola's Mischief", quote: 'only if your opponent has 2 or fewer Prize cards remaining' },
  ],
  uncertainty_pt: '',
};

test('ficha de fatos traz a dor, as duas listas, os ataques copiados e o que o motor concluiu', () => {
  const f = buildFacts(r, me, opp, PAIN);
  assert.match(f, /DOR DO JOGADOR: Morro para o kyurem/);
  assert.match(f, /Trifrost.*COPIADO de Kyurem/);
  assert.match(f, /DIAGNÓSTICO DO MOTOR/);
  assert.match(f, /Shaymin/); // sugestão do motor
});

test('o motor confere cada afirmação: confirma o que é verdade e derruba o que é falso', () => {
  const v = verifyStrategy(FIXTURE, { me, opp, r, db });
  const st = Object.fromEntries(v.claims.map((c) => [c.id, c.status]));
  assert.equal(st.c1, 'ok'); // Slowking + Trifrost (copiado) nocauteia Carvanha
  assert.equal(st.c2, 'erro'); // Kyurem sozinho não paga {W}{W}{M}{M}{C}
  assert.equal(st.c3, 'ok');
  assert.equal(st.c4, 'ok');
  assert.equal(st.c5, 'erro'); // Kangaskhan não nocauteia o Sharpedo de 330
  assert.equal(st.c6, 'erro'); // carta fora da lista
  const t = Object.fromEntries(v.techs.map((x) => [x.card, x.status]));
  assert.equal(t.Shaymin, 'ok');
  assert.equal(t.Carvanha, '?');
  assert.equal(t['Carta Inventada ex'], 'erro');
  assert.equal(v.summary.confirmed, 3);
  // discordância com citação inventada é derrubada; citação real é aceita
  assert.equal(v.disagreements[0].status, 'erro');
  assert.match(v.disagreements[0].check, /Basic Pokémon ex/);
  assert.equal(v.disagreements[1].status, 'ok');
});

test('esquema da resposta: objetos fechados e sem null (a API recusa null misturado a enum)', () => {
  const walk = (s) => { if (s.type === 'object') { assert.equal(s.additionalProperties, false); Object.values(s.properties).forEach(walk); } if (s.items) walk(s.items); assert.ok(!Array.isArray(s.type)); };
  walk(STRATEGY_SCHEMA);
});

test('execução com um cliente falso (sem API): passa a ficha, lê a resposta estruturada e confere', async () => {
  let sent;
  const fake = { messages: { stream: (req) => { sent = req; return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(FIXTURE) }], usage: { input_tokens: 1000, output_tokens: 500 } }) }; } } };
  const out = await runStrategist({ client: fake, myText, oppText, context: PAIN, db });
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.match(sent.messages[0].content, /FICHA DE FATOS/);
  assert.equal(out.verification.summary.confirmed, 3);
  assert.ok(out.usage.usd > 0);
});

test('revisão: a ficha traz o TEXTO das techs sugeridas e pede para a IA conferir cada uma', () => {
  const f = buildFacts(r, me, opp, PAIN);
  assert.match(f, /REVISE AS SUGESTÕES DO MOTOR/);
  const top = r.suggestions[0].card;
  const piece = (top.attacks?.[0]?.effect || top.effect || top.text || '').replace(/\s+/g, ' ').slice(0, 40);
  assert.ok(f.includes(`#1 ${top.name}`), 'nome da 1ª sugestão');
  if (piece) assert.ok(f.includes(piece), 'texto da 1ª sugestão');
  assert.ok(f.length < 60000, 'cabe no limite do servidor');
});

test('revisão: discordância sobre uma sugestão vira aviso ⚠ só se a citação está no texto DELA', () => {
  const top = r.suggestions[0].card;
  const real = (top.text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0].slice(0, 50);
  const s = { ...FIXTURE, disagreements: [
    { text_pt: 'não serve aqui (fixture)', card: top.name, quote: real },
    { text_pt: 'citação inventada (fixture)', card: r.suggestions[1].card.name, quote: 'this card wins the game' },
  ] };
  const v = verifyStrategy(s, { me, opp, r, db });
  assert.deepEqual(v.flags.map((x) => x.card), [top.name]);
  assert.equal(v.disagreements[1].status, 'erro');
});
