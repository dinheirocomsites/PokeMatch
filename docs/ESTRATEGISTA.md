# Estrategista (passo 3) — a IA pensa, o motor confere

## Por que existe
O motor de regras lê carta por carta. Ele erra quando o deck do oponente funciona por **combinação** de cartas
que nenhuma regra previu (ex.: Slowking + Academy at Night + Kyurem: o Slowking usa o Trifrost do Kyurem pagando
só {P}{C}). O estrategista coloca uma IA para **entender o plano** e deixa o motor como **calculadora que confere**.

## Como funciona
1. **Ficha de fatos** (`buildFacts`): o motor monta um resumo do matchup — as duas listas com HP, tipos, fraquezas,
   prêmios, habilidades e ataques (inclusive os ataques **copiados** que o motor já entendeu), o diagnóstico, a
   simulação e as sugestões do motor, e a **dor** do jogador.
2. **Leitura da IA** (`runStrategist`): o Claude responde em **saída estruturada** (`STRATEGY_SCHEMA`):
   plano do oponente, o problema do jogador, **afirmações verificáveis** (`claims`: "X nocauteia Y com o ataque Z",
   "X consegue usar Z", "a carta está na lista"), techs, dicas de jogo e onde discorda do motor.
3. **Conferência** (`verifyStrategy`): o motor confere cada afirmação com as próprias contas — o ataque existe
   (próprio ou copiado), a energia é pagável, o dano (`damageVs`, dano em vários Pokémon) chega no HP do alvo, a tech
   existe entre as legais, funciona no deck (requisitos) e se o motor também a sugere. Cada item recebe
   ✅ confirmado, ❌ derrubado ou ❔ não deu para conferir.
4. **Resposta**: só o que tem ✅ é tratado como fato; o resto aparece como hipótese.

## Onde roda
A chave da API **nunca** vai para o site. O estrategista precisa de um servidor:
- **Local / qualquer servidor Node**: `ANTHROPIC_API_KEY=… npm start` → `POST /api/strategist`
  (limite de 20 leituras por IP por dia, ajustável com `PM_STRATEGIST_LIMIT`; modelo com `PM_STRATEGIST_MODEL`).
- **Avaliação no GitHub**: Actions → "Estrategista (avaliação)" → Run workflow. Usa o segredo `ANTHROPIC_API_KEY`
  e grava o relatório em `docs/estrategista-avaliacao.md`.
- **Site público (próximo passo)**: uma função de servidor (Lovable/Supabase Edge Function, Cloudflare Worker…)
  que chama `runStrategist`; o site aponta para ela em `window.POKEMATCH_STRATEGIST_URL`.

## Custo
~US$ 0,05 a 0,15 por leitura com Claude Opus 5.5 (depende do tamanho das listas). O motor sozinho continua grátis.
