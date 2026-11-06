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
- [x] Cada erro apontado pelo jogador vira **teste permanente** (51 testes ✅)
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
- [x] **Função única de dano por alvo** (`src/damage.js`): lê condições ("se o Ativo for ex", "se estiver ferido", "por prêmio"…) — antes havia 3 fórmulas diferentes (Moltres dava 80/65/110; o certo é 220 no Ogerpon)
- [x] Multiplicadores realistas: "por contador no alvo"/"por condição" = o que o seu deck produz; moeda = média; desconhecido = 1 (não infla)
- [x] **Troca de nocaute** para todo Pokémon legal: nocauteia quem mata seu atacante entregando menos prêmios, pagável com no máx. 1 energia de outro tipo (Moltres agora aparece; Lugia de 3 tipos não)
- [x] Versões com mesmo nome: fica a relevante (Moltres PFL × Moltres 30th)
- [x] **Testes de ouro do dano** (`test/damage.test.js`) + **relatório de lacunas** (`npm run audit`): 65% dos 468 ataques de dano variável entendidos (era 50%)
- [x] **Pacote paga o ataque que dá o valor** (feedback): Moltres e Centiskorch agora levam a Energia de Fogo
- [x] **Turno de evolução** no tempo: Estágio 1 = +1 turno, Estágio 2 = +2 (ou +1 com Rare Candy)
- [x] Simulador: muralha por ataque (Covert Flight) + **oponente usa Boss para contornar muralhas**
- [x] Corrida pesa mais na nota (10 pontos por prêmio de margem); tech que quase não muda a corrida perde impacto
- [x] **Custo total da troca** (feedback): vagas, papel de cada carta que sai (ex.: Judge = disrupção + compra), tempo, banco, energia de outro tipo, prêmios, ACE SPEC e consistência medida
- [x] **Validações pendentes implementadas** (verificador genérico, em toda tech): Tera/Ancient/Future, custo de descarte, "não soma" (1 habilidade por turno), 1x por jogo, 1º turno/quem começa, tabuleiro do oponente, tamanho da mão (51 testes ✅)
- [x] **Site em arquivo único** (`npm run build:single` → `dist-single/pokematch.html`, 2 MB): motor + cartas + exemplos, roda em qualquer hospedagem (Lovable, Netlify…) ou direto do disco
- [x] **Auditoria do que falta** (`docs/LACUNAS.md` + `npm run audit:coverage`): 36% das 2.776 frases de efeito entendidas; lacunas do simulador, consistência, custos, diagnóstico, dados e contexto
- [x] **Rodada 1 das lacunas** (56% das frases entendidas, 49 testes): simulador com prêmios pelo banco, desvantagens, HP extra, redução, disrupção e tempo do oponente; novas famílias de texto; regra contadores ≠ dano; consistência com habilidades de compra; conflitos de Ferramenta/Estádio; nomes PT nas listas; arquétipo
- [x] **Rodada 2:** subtipos oficiais Tera/Ancient/Future (Pokémon TCG API; Dragapult ex é Tera), custo de ataque (Nighttime Mine), HP reduzido (Gravity Mountain), **margem de nocaute** ("matar X todo turno"), degraus de evolução no poder de ataque (51 testes)
- [ ] Cérebro com IA (API do Claude): aguardando a chave do Felipe
- [ ] Validar contra Hydrapple — aguardando a lista do Felipe
- [ ] Ensinar as frases restantes do relatório de lacunas (cauda longa)
- [ ] Caminho "⭐ ACE SPEC de consistência" (ex.: Secret Box × Unfair Stamp) medido no simulador de consistência
- [x] **Diagnóstico por eixos** (caso Dragapult): trava de Itens, reset da mão (e o que dispara), remoção de energia, dano no banco, trava de habilidades — antes só "quem mata seu atacante" (dava 0 sugestões)
- [x] Caminho **🧱 Contra-disrupção**: compra por habilidade, Supporter que busca, aceleração/recuperação de energia, proteção de banco
- [x] **Verificador de requisitos genérico** (Solrock em jogo, energia {X}, Pokémon {X}/Estágio 2, última carta da mão); Item perde força sob trava de Itens
- [x] **Dicas de jogo** geradas dos gatilhos das cartas do oponente ("cada nocaute seu libera Unfair Stamp")
- [x] Nunca devolve zero sugestões (ideias de baixa confiança marcadas)
- [x] Contexto entende Treinadores em PT ("carimbo", "martelo") (quando o oponente te atrapalha: Iono, item lock…) — precisa de um deck de teste com disrupção
- [ ] Usar IA (LLM) para ler a dor com mais nuance e escrever o plano de jogo em linguagem natural

## Fase 6 — Interface web
- [x] Página com duas caixas (sua lista × deck oponente), salva no navegador
- [x] Top 8 techs com imagem real, nota, impacto/encaixe e cortes
- [x] Visual UAAAU 🔥: carta holográfica que inclina com o mouse, anéis de nota animados, confete, Pokébola de loading

## Fase 7 — Validação
- [x] Caso de teste real: Mega Sharpedo ex × Basic Box → **#1 Farigiraf ex** com o pacote Girafarig TWM + Energia Psíquica e todos os combos (51 testes ✅)
- [ ] Testar com mais 3 matchups do meta
- [x] Publicar: versão privada no claude.ai ✅
- [x] Repositório no GitHub: https://github.com/dinheirocomsites/PokeMatch
- [x] Automação: testes + publicação no GitHub Pages a cada push; atualização diária das cartas
- [~] Site público: https://dinheirocomsites.github.io/PokeMatch/

- [x] Pokémon de Treinador (N, Lupo/Hop, Equipe Rocket, Cíntia, Marine, Kissera…): requisitos, buscas, bônus de grupo, cópia do N's Zoroark ex (62 testes ✅)

- [x] Rodada 4: nocaute em 2 ataques, tempo de evolução, veneno/queimadura no Checkup, Boss de verdade; eixos de pressão cedo, cura, moinho, paralisia, virada e trava do Arbok (72 testes ✅)

- [x] Rodada 5: régua em 3 níveis (79% lido · 69% usado), leitor genérico de condições de dano (468/468), contadores, ataque que puxa, proteção/trava do próprio ataque (84 testes ✅)

- [x] Rodada 6: retaliação, aguentar com HP cheio, tirar o Ativo dele, evolução do oponente, cópia do ataque dele, buscas genéricas na mão; 87% lido · 80% usado (96 testes ✅)

- [x] Rodada 7: camada de IA pronta (classificação na sincronização + validação pelo motor + cache) — falta o segredo `ANTHROPIC_API_KEY` no GitHub para rodar (101 testes ✅)
- [ ] Rodar a classificação da IA (depois do segredo) e revisar os rejeitados

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
