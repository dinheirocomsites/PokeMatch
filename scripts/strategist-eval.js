// Avaliação real do estrategista (roda no GitHub Actions com o segredo ANTHROPIC_API_KEY).
// Casos: os matchups de referência + o caso do Slowking reportado pelo Felipe. Gera docs/estrategista-avaliacao.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadDb } from '../src/db.js';
import { runStrategist, DEFAULT_MODEL } from '../src/strategist.js';

if (!process.env.ANTHROPIC_API_KEY) { console.log('Sem ANTHROPIC_API_KEY: nada a fazer.'); process.exit(0); }
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic();
const db = loadDb();
const read = (f) => readFileSync(new URL(`../test/decks/${f}`, import.meta.url), 'utf8');
const CASES = [
  { name: 'Sharpedo × Slowking/Kangaskhan (caso reportado)', mine: 'sharpedo.txt', opp: 'slowking.txt', pain: 'Morro para o kyurem e depois nao volto mais' },
  { name: 'Sharpedo × Dragapult', mine: 'sharpedo.txt', opp: 'dragapult.txt', pain: 'Preciso ter mais consistencia de matar o pult com o sharpedo todo turno, e se eu puder dificultar a vida dele seria uma boa tbm' },
  { name: 'Sharpedo × Basic Box', mine: 'sharpedo.txt', opp: 'basic-box.txt', pain: 'Meu problema é a corrida dos prêmios: morro em um hit para Ogerpon ou Folhas Férreas e perco 3 prêmios de uma vez' },
];
const icon = { ok: '✅', erro: '❌', '?': '❔' };
let md = `# Avaliação do estrategista (${new Date().toISOString().slice(0, 10)}, modelo ${process.env.PM_STRATEGIST_MODEL ?? DEFAULT_MODEL})\n\nA IA lê o matchup; o motor confere cada afirmação (✅ confirmada, ❌ derrubada, ❔ não deu para conferir).\n`;
let total = 0;
const ONLY = process.env.PM_EVAL_ONLY; // ex.: "Basic Box" para rodar só um caso
for (const c of CASES.filter((x) => !ONLY || x.name.includes(ONLY))) {
  const out = await runStrategist({ client, myText: read(c.mine), oppText: read(c.opp), context: c.pain, db, model: process.env.PM_STRATEGIST_MODEL ?? DEFAULT_MODEL });
  total += out.usage.usd;
  const s = out.strategy, v = out.verification;
  md += `\n## ${c.name}\n**Dor:** ${c.pain}\n\n**Plano do oponente (IA):** ${s.opponent_plan.summary_pt}\n\n**O seu problema (IA):** ${s.my_problem.summary_pt} — ${s.my_problem.mechanism_pt}\n\n`;
  md += `**Afirmações conferidas pelo motor** (${v.summary.confirmed}/${v.summary.claims} confirmadas, ${v.summary.refuted} derrubadas):\n${v.claims.map((x) => `- ${icon[x.status]} ${x.text_pt} — _${x.check}_`).join('\n')}\n\n`;
  md += `**Techs sugeridas pela IA:**\n${v.techs.map((x) => `- ${icon[x.status]} **${x.card}** — ${x.why_pt} — _${x.check}_`).join('\n')}\n\n`;
  if (s.play_tips_pt.length) md += `**Como jogar (IA):**\n${s.play_tips_pt.map((x) => `- ${x}`).join('\n')}\n\n`;
  if (v.disagreements.length) md += `**Onde a IA discorda do motor** (citação da carta conferida):\n${v.disagreements.map((x) => `- ${icon[x.status]} ${x.text_pt} — _${x.check}_`).join('\n')}\n\n`;
  if (s.uncertainty_pt) md += `**Incerteza (IA):** ${s.uncertainty_pt}\n\n`;
  md += `_Custo: US$ ${out.usage.usd.toFixed(3)} (${out.usage.input} tokens de entrada, ${out.usage.output} de saída)._\n`;
  console.log(`${c.name}: ${v.summary.confirmed}/${v.summary.claims} confirmadas · discordâncias ${v.disagreements.map((x) => x.status).join(',') || '—'} · techs ${v.techs.map((x) => `${x.card}[${x.status}]`).join(', ')} · US$ ${out.usage.usd.toFixed(3)}`);
}
md += `\n---\nCusto total desta avaliação: **US$ ${total.toFixed(2)}**.\n`;
writeFileSync(new URL('../docs/estrategista-avaliacao.md', import.meta.url), md);
console.log(`Total: US$ ${total.toFixed(2)}`);
