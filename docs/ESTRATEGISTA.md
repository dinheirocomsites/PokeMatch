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

## Servidor (Cloudflare Workers, plano grátis)
O motor é pesado para servidor grátis, então ele **continua no navegador**: o navegador monta a ficha de fatos,
manda **só a ficha** ao servidor, o servidor chama o Claude (com o prompt e o esquema que ficam nele) e devolve a
resposta; o navegador confere cada afirmação com o motor. O servidor (`deploy/strategist-proxy.js`) só aceita o site
como origem, só aceita a ficha do PokeMatch, limita leituras por IP por dia (`PM_STRATEGIST_LIMIT`, padrão 20) e
nunca expõe a chave. Publicação: `.github/workflows/deploy-strategist.yml` (segredos `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY`). Depois da 1ª publicação, o endereço vai em `deploy/strategist-url.txt`
e os builds ligam o site a ele. **Proteção de custo principal**: limite mensal de gastos no Console da Anthropic.

## Onde roda
A chave da API **nunca** vai para o site. O estrategista precisa de um servidor:
- **Local / qualquer servidor Node**: `ANTHROPIC_API_KEY=… npm start` → `POST /api/strategist`
  (limite de 20 leituras por IP por dia, ajustável com `PM_STRATEGIST_LIMIT`; modelo com `PM_STRATEGIST_MODEL`).
- **Avaliação no GitHub**: Actions → "Estrategista (avaliação)" → Run workflow. Usa o segredo `ANTHROPIC_API_KEY`
  e grava o relatório em `docs/estrategista-avaliacao.md`.
- **Site público (próximo passo)**: uma função de servidor (Lovable/Supabase Edge Function, Cloudflare Worker…)
  que chama `runStrategist`; o site aponta para ela em `window.POKEMATCH_STRATEGIST_URL`.

## Uma análise só, já revisada (decisão do Felipe)
"Prefiro que o usuário espere até 1 minuto para gerar a análise mais correta possível" — nada de mostrar o motor e depois
a própria ferramenta dizer que errou. Toda análise é assim (no site com o servidor ligado):
1. **Motor** (~2 s, no navegador; `limit 12`).
2. **Tela de espera** enquanto a IA trabalha (20–60 s): etapas com progresso; **"Como o PokeMatch entendeu o SEU deck"**
   (`src/explain.js`: atacante principal e a conta do dano — com quem habilita o bônus —, o que soma dano montado, peças do
   banco, energia/aceleração, outros atacantes, ataques copiados; e o mesmo do oponente) com **👍 É isso / ✏️ Não é bem
   assim** (o segundo para tudo e leva para o campo da dor com "Como o meu deck funciona:"); e um **quiz do matchup**
   tirado das duas listas (fraqueza, prêmios, ataques, dano, recuo, HP), com a carta revelada depois da resposta.
3. **Revisão da IA**: a ficha traz o **texto das 6 primeiras techs** e pede para conferir cada uma neste matchup. Se a IA
   derruba uma tech, precisa citar o trecho exato da carta; o motor confere a citação no texto **daquela versão** da carta
   (`verification.flags`). Caso que motivou: Diancie no espelho do Sharpedo.
4. **Resultado único**: tech derrubada **sai da lista** (vai para "Cartas que analisamos e descartamos" com o motivo);
   ficam até 8. Na seção do estrategista aparece só o que o motor confirmou (✅), as techs extras da IA que são legais e
   funcionam no deck, as dicas de jogo; afirmações derrubadas e a conferência completa ficam em **"Bastidores"** (recolhido).
5. **Se a IA falhar** (limite do dia, rede, mais de 100 s): mostra a análise do motor com uma nota e "Tentar de novo".
- **Leitura guardada**: mesmas listas + mesma dor = mesma ficha → o navegador reaproveita a leitura (últimas 8), sem
  custo; "Refazer a leitura da IA" (nos bastidores) força outra. O servidor não mudou (prompt e esquema iguais).

## Custo
~US$ 0,05 a 0,15 por leitura com Claude Opus 5.5 (depende do tamanho das listas). O motor sozinho continua grátis.
