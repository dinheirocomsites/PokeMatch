# PokeMatch — Checklist

Legenda: [x] feito · [~] em andamento · [ ] a fazer

## Fase 0 — Fundação
- [x] Escolher a API de cartas → TCGdex (grátis, tem PT-BR, regulation mark)
- [x] Liberar acesso de rede à API no ambiente
- [x] Validar os dados da API (descoberta: a flag `legal` dos SETS é inconsistente; usar regulation mark)
- [x] Criar a estrutura do projeto (Node.js, zero dependências)

## Fase 1 — Base de cartas
- [x] Script de sincronização (`npm run sync`): marca **H em diante** — marcas novas entram sozinhas
- [x] Base local `data/cards.json`: 3.059 impressões / 1.400 cartas únicas (H: 1303, I: 1278, J: 470)
- [x] Conferência: marca × flag da API → bate (1 divergência: `mep-051`, marca em minúsculo)

## Fase 2 — Leitura das listas
- [x] Parser do formato de exportação do TCG Live / Limitless
- [x] Casar cada linha com a base (set + número; fallback por nome — reimpressão legal vale)
- [x] Validar a lista: 60 cartas, máx. 4 cópias, 1 ACE SPEC, cartas rotacionadas (5 testes ✅)

## Fase 3 — Perfil do deck (as fraquezas)
- [x] Perfil do oponente: poder de ataque por carta, básicos/ex/Mega, fraquezas ponderadas, habilidades, itens, estádio, banco grande
- [x] Perfil do seu deck: tipos de energia, buscas (Ultra Ball, Poké Pad, Poffin, Petrel…), atacante principal, ACE SPEC

## Fase 4 — Classificação das mecânicas (o coração)
- [x] Classificador por regras lendo habilidades/ataques/treinadores → etiquetas com **seletor de alvo** (ex.: Básico + ex)
- [x] 16 etiquetas: muralha, muralha só no banco, proteção do time, redução, trava de habilidade/item/supporter, dano extra, pune banco, ferramenta, energia especial, estádio, energia, mão…
- [~] Revisão manual das etiquetas (corrigido: muralhas que só funcionam no banco; falta revisar o resto)

## Fase 5 — Motor de sugestões
- [x] Nota de impacto (cobertura do poder de ataque do oponente)
- [x] Nota de encaixe (energia p/ atacar, linha de evolução, busca, prêmios, ACE SPEC)
- [x] Sugerir o que cortar (protege atacante principal, Boss, motores de habilidade e counters que você já tem)
- [x] Explicação em PT-BR + seção "Você já tem" (ex.: Watchtower desliga Kangaskhan/Meowth)

## Fase 5.5 — Análise profunda (feedback do Felipe)
- [x] Encaixe dividido em 4 critérios visíveis: **Recursos · Peso · Sinergia · Risco**
- [x] **Risco de muralha**: o que passa pela muralha nocauteia ela? (Passimian 20×9 = 180 > Crustle 150 HP)
- [x] Dano realista de ataques "×" e "+" no contexto do deck (banco de 8 com Area Zero etc.)
- [x] **Versões da mesma carta**: Girafarig TEF ≠ Girafarig TWM — escolhe a melhor pré-evolução para o seu deck
- [x] **Pacote completo**: pré-evolução + tech + energia habilitadora (ex.: +1 Energia Psíquica)
- [x] Energia que destrava outras cartas suas (Munkidori "Mind Bend") conta como meio slot
- [x] **Cadeias de combo**: aceleração de energia por tipo (Toxtricity), troca p/ Ativo (Pecharunt) + veneno → Binding Mochi +40, dano passivo (Munkidori)
- [x] **Dano real no seu deck** + quem ele nocauteia (160 + 40 + 30 = 230 → 11 atacantes)
- [x] Plano de troca explícito, começando por cartas **mortas no matchup** (Gravity Mountain)
- [x] Seletores que não sabemos ler não viram mais "qualquer Pokémon" (Carracosta, Heatran, Rabsca)

## Fase 5.6 — Contexto, corrida de prêmios e caminhos (feedback do Felipe)
- [x] **Quem realmente ataca**: custo do ataque × energias da lista (Chien-Pao precisa {W}{W}, a lista tem 1 Água → não conta)
- [x] **Campo "qual é a sua dor?"** em PT: detecta a dor (prêmios, morrer rápido, disrupção, setup, dano, ACE SPEC) e as cartas citadas
- [x] **Nomes em português** no sync (3.050 cartas) → "Folhas Férreas" = Iron Leaves ex
- [x] **Simulador de corrida de prêmios** turno a turno: oponente escolhe quem entrega menos prêmios, Boss limitado, alvo só no banco real, dano dependente do estado (60× prêmios, ferido, envenenado, Munkidori)
- [x] Muralhas entram na simulação (Farigiraf ex: Ogerpon/Iron Leaves não causam dano)
- [x] **Plano de jogo**: "só com Mega Sharpedo" (derrota 4×6) × "melhor ordem com a sua lista" (vitória 6×4)
- [x] Cartas que **reduzem prêmios** (Legacy Energy, Mega Gengar ex, Munkidori ex, Lillie's Pearl) testadas no simulador
- [x] **Caminhos agrupados**: 🏁 Prêmios · 🛡️ Muralha · ⭐ ACE SPEC · 💥 Dano · 🚫 Disrupção — os da sua dor sobem
- [x] Corrigidos falsos positivos: "dano de 40 ou menos" (Roggenrola), "só se nocautear" (Golisopod/Marshadow)
- [x] **Correção (feedback):** simulador agora considera energia por turno (atacante novo precisa ser energizado), custo de Boss/energia, nocautear o Ativo antes de gastar Boss, e mostra quem está no Ativo em cada turno → linha certa: Pecharunt ex mata o Ogerpon (60×3+30) sem Boss
- [x] Linha alternativa de jogo + anti-sinergia detectada: Legacy Energy reduz o dano do Pecharunt ex (menos prêmios tomados)
- [x] Cada erro apontado pelo jogador vira **teste permanente** (23 testes ✅)
- [x] **Passo para trás (feedback):** diagnóstico primeiro — "por que ESTE deck perde ESTE matchup" (quem mata seu atacante, troca de prêmios, banco cheio)
- [x] **Filtro de relevância:** só sugere o que bloqueia quem mata seu atacante, vira a corrida na simulação ou reduz prêmios entregues; o resto vai para "descartadas" com o motivo
- [x] **Espaço no banco** do plano do deck entra no peso (Sharpedo: banco cheio com Pecharunt, Toxtricity, Munkidori, Fezandipiti + Carvanha)
- [x] Energia fora do tipo para efeito de **ataque recorrente** é penalizada (Dipplin fora); muralha de time que não protege o atacante principal não conta (Neutralization Zone fora)
- [x] **Versão web publicada** (motor roda no navegador): https://claude.ai/artifact/Bk5ULBHYeLMX7REJNJFVo9 — imagens de cartas viram cards com nome/cor (a página não pode carregar imagens externas)
- [x] **Custo de consistência por troca** (Monte Carlo, 6.000 partidas): setup do atacante principal até T2, Supporter na mão inicial, achar a tech até T3, risco de prêmio — antes × depois
- [x] Estágio 2 sugerido com a linha inteira (Gastly → Haunter → Mega Gengar ex)
- [x] **Imagens das cartas na versão publicada**: 2.014 miniaturas em 18 pacotes por coleção (29 MB), carregadas sob demanda — a página do claude.ai bloqueia imagens externas
- [x] **Tempo de energização** (feedback): custo do ataque que dá o valor em turnos de ligação, considerando aceleração do deck (Sizzlipede 3 energias = ✗ ~3 turnos); habilidade = ataque vale metade
- [x] Corrigido raciocínio errado: energia ligada fica no Pokémon — o custo da energia fora do tipo é achar a cópia, não "pagar todo turno"
- [x] Muralha por ataque que bate pouco (<60) é penalizada ("segura 1 turno mas não avança")
- [x] Relevância: atacante de 1 prêmio, barato, que bate na fraqueza de quem te mata (caso Moltres × Hydrapple)
- [x] Roteiro de jogo genérico: "Boss num Pokémon de 2 prêmios que você nocauteia (X, Y, Z)"
- [x] Imagens dos "Caminhos" no site do GitHub Pages (URL de reserva do TCGdex corrigida)
- [ ] Caminho "⭐ ACE SPEC de consistência" (ex.: Secret Box × Unfair Stamp) medido no simulador de consistência
- [ ] Caminho "contra-disrupção" (quando o oponente te atrapalha: Iono, item lock…) — precisa de um deck de teste com disrupção
- [ ] Usar IA (LLM) para ler a dor com mais nuance e escrever o plano de jogo em linguagem natural

## Fase 6 — Interface web
- [x] Página com duas caixas (sua lista × deck oponente), salva no navegador
- [x] Top 8 techs com imagem real, nota, impacto/encaixe e cortes
- [x] Visual UAAAU 🔥: carta holográfica que inclina com o mouse, anéis de nota animados, confete, Pokébola de loading

## Fase 7 — Validação
- [x] Caso de teste real: Mega Sharpedo ex × Basic Box → **#1 Farigiraf ex** com o pacote Girafarig TWM + Energia Psíquica e todos os combos (23 testes ✅)
- [ ] Testar com mais 3 matchups do meta
- [x] Publicar: versão privada no claude.ai ✅
- [x] Repositório no GitHub: https://github.com/dinheirocomsites/PokeMatch
- [x] Automação: testes + publicação no GitHub Pages a cada push; atualização diária das cartas
- [~] Site público: https://dinheirocomsites.github.io/PokeMatch/

## Próximos passos (ideias)
- [ ] Interações mais finas: Boss's Orders do oponente contorna muralha; muralha precisa estar Ativa
- [ ] Analisar contra o meta inteiro de uma vez (várias listas)
- [ ] Probabilidade de ter a tech no turno X (simulação de mão)
- [ ] Interface em inglês + nomes das cartas em PT-BR (TCGdex tem)

## Descobertas / decisões
- A flag `legal` dos **sets** no TCGdex está errada (todos aparecem fora do Standard); a das **cartas** está certa. Usamos a regulation mark.
- Legalidade é **por nome**: Ultra Ball SVI (G) pode ser usada porque existe reimpressão legal (MEG, marca I).
- A API não marca Megas como `ex` no campo `suffix` → detectamos pelo nome ("Mega …", "… ex").
- Farigiraf ex — Armor Tail: *previne todo dano causado a ele por ataques de Pokémon Básicos ex*.
- O set **30th Celebration** vem da API sem regulation mark → entra pela lista `EXTRA_LEGAL_SETS` em `src/config.js`.
- A API não marca Pokémon **Tera** → lista curada em `src/tags.js`.
- Muitas "muralhas" só funcionam **no banco** (Poltchageist, Antique Plume Fossil…) → etiqueta separada `BENCH_WALL`.
- Crustle ficou acima do Farigiraf ex: bloqueia **todo** Pokémon ex (inclusive não-Básicos) e entrega só 1 prêmio.
