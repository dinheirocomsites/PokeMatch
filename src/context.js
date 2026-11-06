// Lê o texto livre do jogador ("qual é a sua dor?") e transforma em pesos para
// os caminhos de melhoria + cartas citadas (nomes em inglês ou português).
import { normName } from './db-core.js';

export const CLUSTERS = {
  premios: { icon: '🏁', title: 'Corrida de prêmios', desc: 'Entregar menos prêmios, pegar mais, ou trocar melhor (atacantes de 1 prêmio, Legacy Energy…).' },
  protecao: { icon: '🛡️', title: 'Muralha / proteção', desc: 'Pokémon e efeitos que o oponente não consegue atacar ou que reduzem o dano.' },
  disrupcao: { icon: '🚫', title: 'Disrupção no oponente', desc: 'Travar habilidades, itens, estádio, energia ou a mão do oponente.' },
  dano: { icon: '💥', title: 'Dano e fraqueza', desc: 'Bater mais forte nos alvos certos: fraqueza, dano extra contra ex, banco grande.' },
  contra: { icon: '🧱', title: 'Contra-disrupção', desc: 'Continuar jogando apesar da trava de Itens, do reset da mão, da remoção de energia ou do dano no banco.' },
  acespec: { icon: '⭐', title: 'Troca de ACE SPEC', desc: 'ACE SPECs que resolvem melhor este matchup do que a sua atual.' },
};

const PAINS = [
  { key: 'premios', label: 'corrida de prêmios', re: /pr[eê]mio|prize|corrida|troca de|trade|conta n[aã]o fecha|3 de uma vez|tr[eê]s de uma vez|entrego \d|pega(r)? \d/ },
  { key: 'protecao', label: 'seu atacante cai rápido', re: /morr|um hit|1 hit|one ?shot|ohko|de primeira|n[aã]o aguent|muito dano|bate muito|mata (o )?meu|dies? (in one|to)|gets? ko/ },
  { key: 'disrupcao', label: 'quer atrapalhar o oponente', re: /travar|atrapalh|dificult|complicar a vida|atrasar|disrup[cç][aã]o nele|quero (travar|disrup)|lock nele|tirar (a )?energia|desligar/ },
  { key: 'contra', label: 'o oponente te atrapalha (disrupção)', re: /iono|judge|juiz|carimbo|stamp|martelo|hammer|item ?lock|spread|banco morre|morre no banco|me trava|trava(m)? (os )?(meus )?ite|item lock|minha m[aã]o|travam? (os )?meus|perco (a m[aã]o|energia)|tira(m)? (minha )?energia|me disrupt|disrup[cç][aã]o (dele|do oponente)|budew/ },
  { key: 'consistencia', label: 'setup / consistência', re: /lento|setup|consist|brick|n[aã]o monto|n[aã]o compro|demora|m[aã]o ruim|dead hand|slow/ },
  { key: 'dano', label: 'consistência de nocaute / falta dano', re: /falta dano|n[aã]o mato|matar (o |a )?\w+ (com o \w+ )?todo turno|nocautear todo turno|consist[eê]ncia de matar|mais consist[eê]ncia de (matar|nocautear)|n[aã]o consigo matar|pouco dano|hp alto|n[aã]o chego|bater mais/ },
  { key: 'acespec', label: 'ACE SPEC', re: /ace ?spec|legacy|energia legado/ },
];

const GENERIC = new Set(['energy', 'energia', 'pokemon', 'mascara', 'team', 'rocket', 'rocket\'s', 'turquesa', 'orders', 'ordens', 'chefe', 'determination', 'determinacao', 'stretcher', 'maca']);
const short = (s) => normName(s).replace(/^mega /, '').replace(/ ex$/, '').trim();

export function readContext(text, me, opp, db) {
  const raw = normName(text ?? '');
  if (!raw) return { empty: true, weights: {}, pains: [], mentions: { mine: [], opp: [] } };
  // Negação: "não é problema", "não sofro com", "sem problema de" antes da palavra-chave anula a dor
  const negated = (re) => { const m = raw.match(re); if (!m) return false; const before = raw.slice(Math.max(0, m.index - 25), m.index); return /n[aã]o (e|é|tenho|sofro|ligo|me preocupo)|sem problema|tranquilo|not (a )?problem/.test(before); };
  const pains = PAINS.filter((p) => p.re.test(raw) && !negated(p.re));
  const weights = {};
  for (const p of pains) weights[p.key] = (weights[p.key] ?? 1) + 0.5;
  if (weights.protecao) weights.premios = (weights.premios ?? 1) + 0.2; // morrer rápido = perder a corrida
  const find = (deck) => {
    const out = new Set();
    for (const e of deck.entries) {
      if (e.card.category === 'Energy') continue;
      for (const n of [e.card.name, e.card.namePt].filter(Boolean)) {
        const k = short(n);
        const words = [k, ...k.split(' ').filter((w) => w.length >= 6 && !GENERIC.has(w))];
        // nomes de Treinador em PT costumam ser citados pela 1ª palavra ("carimbo", "martelo")
        if (e.card.category === 'Trainer') { const first = k.split(' ')[0]; if (first.length >= 6 && !GENERIC.has(first)) words.push(first); }
        if (words.some((w) => w.length >= 4 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(raw))) out.add(e.card.name);
      }
    }
    return [...out];
  };
  const mentions = { mine: find(me), opp: find(opp) };
  const nums = raw.match(/(\d) (pr[eê]mios?|prizes?)/g) ?? [];
  const summary = [
    pains.length ? `Sua dor: ${pains.map((p) => p.label).join(', ')}.` : 'Não identifiquei uma dor específica — vou usar a análise geral.',
    mentions.opp.length ? `Ameaças citadas: ${mentions.opp.join(', ')}.` : '',
    mentions.mine.length ? `Suas cartas citadas: ${mentions.mine.join(', ')}.` : '',
    nums.length ? `Números citados: ${nums.join(', ')}.` : '',
  ].filter(Boolean);
  return { empty: false, weights, pains: pains.map((p) => p.key), mentions, summary };
}

// Em qual "caminho" uma sugestão se encaixa
export function clusterOf(s) {
  const k = s.reasons[0]?.kind;
  if (k === 'PRIZE_RACE' || k === 'PRIZE_DENIAL' || k === 'KO_TRADE') return 'premios';
  if (k?.startsWith('ANTI_')) return 'contra';
  if (k === 'KO_GAP' || k === 'HP_DOWN') return 'dano';
  if (k === 'COST_CHANGE') return 'disrupcao';
  if (['WALL_SELF', 'WALL_TEAM', 'WALL_CHOSEN', 'REDUCE', 'BENCH_WALL', 'SURVIVE'].includes(k)) return 'protecao';
  if (['STATUS', 'PLACE_COUNTERS'].includes(k)) return 'disrupcao';
  if (['ABILITY_LOCK', 'ITEM_LOCK', 'SUPPORTER_LOCK', 'HAND_DISRUPT', 'ENERGY_DISRUPT', 'STADIUM_HATE', 'STADIUM_REPLACE', 'TOOL_HATE', 'SPECIAL_ENERGY_HATE'].includes(k)) return 'disrupcao';
  return 'dano';
}
