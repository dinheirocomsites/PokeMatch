// Teste real do servidor publicado (ex.: Lovable): faz exatamente o que o site faz — o motor monta a ficha,
// manda ao servidor como se fosse o site (Origin do GitHub Pages) e confere a resposta com o motor.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { prepareStrategy, verifyStrategy } from '../src/strategist.js';

const url = process.env.PM_URL || readFileSync(new URL('../deploy/strategist-url.txt', import.meta.url), 'utf8').trim();
const db = loadDb();
const read = (f) => readFileSync(new URL(`../test/decks/${f}`, import.meta.url), 'utf8');
const prep = prepareStrategy({ myText: read('sharpedo.txt'), oppText: read('slowking.txt'), context: 'Morro para o kyurem e depois nao volto mais', db });
console.log(`Servidor: ${url}\nFicha: ${prep.facts.length} caracteres`);
const t0 = Date.now();
const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://dinheirocomsites.github.io' }, body: JSON.stringify({ facts: prep.facts }) });
const text = await res.text();
console.log(`Resposta HTTP ${res.status} em ${((Date.now() - t0) / 1000).toFixed(1)} s; CORS: ${res.headers.get('access-control-allow-origin')}`);
let data;
try { data = JSON.parse(text); } catch { console.log(text.slice(0, 500)); process.exit(1); }
if (!res.ok) { console.log('Erro:', data.error ?? text.slice(0, 500)); process.exit(1); }
const v = verifyStrategy(data.strategy, { me: prep.me, opp: prep.opp, r: prep.r, db });
console.log(`Modelo: ${data.model} · custo ~US$ ${data.usage?.usd?.toFixed(3)}`);
console.log(`Plano (IA): ${data.strategy.opponent_plan.summary_pt}`);
console.log(`Afirmações: ${v.summary.confirmed}/${v.summary.claims} confirmadas, ${v.summary.refuted} derrubadas`);
for (const c of v.claims) console.log(`  ${c.status === 'ok' ? '✅' : c.status === 'erro' ? '❌' : '❔'} ${c.text_pt} — ${c.check}`);
console.log(`Techs da IA: ${v.techs.map((t) => `${t.card} [${t.status}${t.check ? `: ${t.check}` : ''}]`).join(' · ')}`);
// Revisão das techs do motor (o que o site faz antes de mostrar)
const top = (prep.r.suggestions ?? []).map((x) => x.card.name);
console.log(`\nTechs do motor (antes da revisão): ${top.slice(0, 8).join(', ')}`);
console.log(`Discordâncias da IA: ${v.disagreements.length}`);
for (const d of v.disagreements) console.log(`  ${d.status === 'ok' ? '✅' : d.status === 'erro' ? '❌' : '❔'} [${d.card}] ${d.text_pt}\n      citação: "${d.quote}" — ${d.check}`);
const flagged = new Set(v.flags.map((f) => f.card));
console.log(`Derrubadas na revisão (citação conferida): ${[...flagged].join(', ') || 'nenhuma'}`);
console.log(`Lista final que o site mostra: ${top.filter((n) => !flagged.has(n)).slice(0, 8).join(', ')}`);
console.log(`\nDicas de jogo (IA):\n${(data.strategy.play_tips_pt ?? []).map((x) => `  - ${x}`).join('\n')}`);
if (data.strategy.uncertainty_pt) console.log(`Incerteza: ${data.strategy.uncertainty_pt}`);
writeFileSync('remote-test.json', JSON.stringify({ status: res.status, model: data.model, usage: data.usage, summary: v.summary, flags: v.flags }, null, 1));
