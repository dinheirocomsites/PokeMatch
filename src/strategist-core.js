// Núcleo do estrategista SEM o motor: prompt, esquema da resposta e a chamada à API.
// É o que roda no servidor (Cloudflare Workers / Deno / Supabase): guarda a chave e só fala com o Claude.
// A ficha de fatos e a conferência das afirmações ficam no navegador (src/strategist.js), onde o motor já roda.
export const DEFAULT_MODEL = 'claude-opus-5-5';
export const MAX_FACTS = 60000; // caracteres: listas completas + análise do motor cabem com folga

// Esquema da resposta (sem null: "vazio" é "" ou 0)
export const STRATEGY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['opponent_plan', 'my_problem', 'claims', 'tech_ideas', 'play_tips_pt', 'disagreements', 'uncertainty_pt'],
  properties: {
    opponent_plan: {
      type: 'object', additionalProperties: false, required: ['summary_pt', 'damage_sources', 'enablers', 'key_turns_pt'],
      properties: {
        summary_pt: { type: 'string' },
        damage_sources: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['attacker', 'attack', 'copied_from', 'targets', 'why_pt'],
            properties: { attacker: { type: 'string' }, attack: { type: 'string' }, copied_from: { type: 'string' }, targets: { type: 'string', enum: ['active', 'bench', 'several'] }, why_pt: { type: 'string' } },
          },
        },
        enablers: { type: 'array', items: { type: 'string' } },
        key_turns_pt: { type: 'string' },
      },
    },
    my_problem: { type: 'object', additionalProperties: false, required: ['summary_pt', 'mechanism_pt'], properties: { summary_pt: { type: 'string' }, mechanism_pt: { type: 'string' } } },
    claims: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'kind', 'attacker', 'attack', 'target', 'text_pt'],
        properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['ko', 'can_attack', 'in_deck'] }, attacker: { type: 'string' }, attack: { type: 'string' }, target: { type: 'string' }, text_pt: { type: 'string' } },
      },
    },
    tech_ideas: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['card', 'why_pt', 'answers'], properties: { card: { type: 'string' }, why_pt: { type: 'string' }, answers: { type: 'array', items: { type: 'string' } } } },
    },
    play_tips_pt: { type: 'array', items: { type: 'string' } },
    // Discordância com o motor: precisa citar o trecho EXATO do texto da carta em que se apoia (o motor confere a citação)
    disagreements: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['text_pt', 'card', 'quote'], properties: { text_pt: { type: 'string' }, card: { type: 'string' }, quote: { type: 'string' } } },
    },
    uncertainty_pt: { type: 'string' },
  },
};

export const SYSTEM_PT = `Você é um jogador experiente de Pokémon TCG (Standard) ajudando a preparar um matchup.
Você recebe uma FICHA DE FATOS montada por um motor de regras (listas, textos das cartas, contas e simulação do motor) e a DOR do jogador.
Sua tarefa:
1. Entender o PLANO REAL do oponente: quem causa o dano, com qual ataque, como paga a energia (inclusive ataques copiados de outras cartas, do deck, do banco), quais cartas habilitam o plano e em que turno ele chega.
2. Explicar o problema do jogador (a dor) pelo mecanismo do jogo.
3. Fazer AFIRMAÇÕES VERIFICÁVEIS em "claims" (o motor vai conferir cada uma):
   - kind "ko": attacker = nome exato do Pokémon do oponente que ataca; attack = nome exato do ataque usado (se for copiado, o nome do ataque original); target = nome exato do Pokémon do jogador que cai.
   - kind "can_attack": o attacker consegue usar o attack neste deck.
   - kind "in_deck": a carta (attacker) está na lista do oponente.
4. Sugerir techs em "tech_ideas": cartas legais no Standard atual, com o nome exato em inglês; em "answers", os ids das claims que a tech responde. Prefira poucas e certeiras.
5. Dicas de jogo em "play_tips_pt" (o que fazer na partida, não só no deck).
6. Se você discordar da análise do motor, registre em "disagreements": o porquê (text_pt), a carta em que se apoia (card, nome exato) e o trecho EXATO do texto dessa carta, em inglês, copiado da ficha (quote). Sem citação exata, não discorde: o motor vai conferir a citação.
Regras: use só nomes de cartas que existem; nunca invente números nem efeitos — o texto das cartas está na ficha, confira antes de afirmar; escreva em português do Brasil; seja direto, sem preâmbulo.`;


// Chama o Claude com a ficha de fatos e devolve a estratégia (JSON validado pelo esquema da API)
export async function requestStrategy(client, facts, { model = DEFAULT_MODEL, maxTokens = 16000 } = {}) {
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PT,
    output_config: { format: { type: 'json_schema', schema: STRATEGY_SCHEMA } },
    messages: [{ role: 'user', content: `FICHA DE FATOS DO MATCHUP\n\n${facts}` }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('a IA recusou responder');
  if (msg.stop_reason === 'max_tokens') throw new Error('resposta da IA cortada (max_tokens)');
  const strategy = JSON.parse(msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const u = msg.usage ?? {};
  return { strategy, usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, usd: ((u.input_tokens ?? 0) * 4 + (u.output_tokens ?? 0) * 20) / 1e6 }, model };
}
