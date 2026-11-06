# PokeMatch — o que a ferramenta ainda NÃO valida ou classifica

## Progresso
| Rodada | Frases de efeito entendidas | Dano variável | Testes |
|---|---|---|---|
| Levantamento inicial | 36% | 65% | 42 |
| Rodada 1 (simulador, texto, consistência, custos) | 56% | 65% | 49 |
| Rodada 2 (subtipos oficiais, custo de ataque, margem de nocaute) | 56%+ | 65% | 51 |
| Rodada 3 (Pokémon de Treinador: N, Lupo/Hop, Equipe Rocket…) | **58%** | 65% | **62** |

### Coberto na rodada 3 (pedido: "mapear Zoroark do N, do Lupo… cartas que interagem por serem desses 'tipos'")
- **Dono de cada Pokémon** lido do nome (`N's Zoroark ex` → N; `Team Rocket's Mewtwo ex` → Equipe Rocket): 13 donos, 249 cartas. Treinadores com nome de dono (Team Rocket's Petrel) **não** contam como "Pokémon de".
- **Requisitos de dono** conferidos contra a sua lista: *"não pode atacar a menos que tenha 4+ Pokémon da Equipe Rocket"* (Mewtwo ex), *"só pode ser ligada em Pokémon da Equipe Rocket"* (Team Rocket's Energy), *"só se um Pokémon da Equipe Rocket seu foi nocauteado"* (Archer), apoio que só serve ao dono (Hop's Bag, N's PP Up, Proton, Giovanni, Power Weight, Lillie's Pearl…) → **bloqueado** se você não tem Pokémon desse dono; *"…instead"* (Arven's Sandwich, Ariana) → só o bônus cai.
- **Estádios dos dois jogadores** (N's Castle, Postwick, Granite Cave, Spikemuth Gym): se só o oponente tem Pokémon do dono, a ferramenta avisa que a carta **ajuda só ele**.
- **Lista de Pokémon específicos em jogo** (Anthea & Concordia exige os 6 de N) → diz quais faltam.
- **Bônus de grupo** (Hop's Snorlax, Postwick, Hop's Choice Band, Cynthia's Roserade: +30 só para Pokémon do dono) — vale para o seu atacante se ele for do dono, e para o do oponente no cálculo de risco.
- **Dano por contagem de dono** (Team Rocket's Spidops, Erika's Victreebel, Misty's Gyarados).
- **Buscas restritas ao dono** (Hop's Bag, Proton, Great Ball, Gabite, Lapras, Comfey, Baltoy, Spikemuth Gym) no simulador de consistência e na nota "sai com".
- **Cópia de ataque (N's Zoroark ex – Night Joker)**: o Zoroark ganha os ataques dos Pokémon de N do banco pagando só {D}{D}; uma tech de N vira **fonte de cópia** (ex.: N's Zekrom: Zoroark usa Rampaging Thunder 250 sem energia Elétrica) e não é penalizada por não conseguir pagar o próprio ataque.
- Campo de dor entende "os Pokémon do N", "do Lupo", "da Equipe Rocket", "da Cíntia", "Kissera"…

**Ainda não**: o simulador de prêmios não troca o atacante copiado turno a turno (usa o melhor ataque copiável); Lillie's Pearl/Anthea & Concordia no simulador; TR Arbok (trava de habilidades com exceção da Equipe Rocket) e mover contadores entre Pokémon da Equipe Rocket (Orbeetle/Wobbuffet).

### Coberto na rodada 2 (pedido: "matar o Pult todo turno e dificultar a vida dele")
- **Dado que faltava:** Tera/Ancient/Future agora vêm da **Pokémon TCG API** (subtipos oficiais) — antes eram 6 nomes manuais;
  o Dragapult ex não estava marcado como Tera. Agora: 36 Tera, 18 Ancient, 25 Future legais.
- **Leitura nova:** custo de ataque (Nighttime Mine: Tera +{C}; Sparkling Crystal: −1) e HP reduzido (Gravity Mountain: Estágio 2 −30).
- **Análise nova — margem de nocaute:** o seu atacante principal mata o atacante principal dele SOZINHO? Quantas peças do combo
  precisam estar montadas todo turno? Techs que fecham a margem (dano extra contra o alvo, HP reduzido) e o custo "todo turno"
  (Ferramenta/Estádio ficam em jogo; Supporter gasta o Supporter do turno; Item pode ser travado).
- **Correção do poder de ataque:** degraus de evolução (Dreepy, Drakloak) contam só 30% — o Dragapult ex passa de 36% para 45%.

### Coberto na rodada 1
- **Simulador:** prêmios pelo banco (dano espalhado e contadores, Risky Ruins), desvantagens de ataque dos dois lados,
  HP extra de Ferramenta (Hero's Cape), redução de dano por habilidade, fraqueza alterada (Lillie's Clefairy ex),
  cópia de ataques (Mew ex), disrupção do oponente (Crushing Hammer, Unfair Stamp após o seu nocaute, trava de Itens no 1º turno),
  tempo do oponente (Estágio 2 só no 2º turno; Básico que trava Itens abre no Ativo).
- **Texto:** desvantagem de ataque, condições especiais, cura, troca/recuo, prender no Ativo, mover energia,
  colocar contadores, HP extra, descarte da mão do oponente.
- **Regra do jogo:** "colocar contadores" ≠ "causar dano" (Battle Cage × Shadowy Darkness Energy).
- **Diagnóstico:** eixo "prender no Ativo"; dano no banco conta quem cai em 2 ataques; HP extra que faz o atacante sobreviver.
- **Consistência:** habilidades de compra, buscas feitas por Pokémon, custo de descarte do Ultra Ball.
- **Custos:** conflito de Ferramenta (1 por Pokémon) e de Estádio (seu × oponente); Ferramenta restrita a um Pokémon.
- **Listas e contexto:** nomes em português nas listas; negação, inglês e gírias no contexto; arquétipo provável do oponente.

---

Levantamento de 06/11/2026 (tabela original abaixo; números atualizados pela auditoria a cada rodada). Números da auditoria `npm run audit:coverage` (texto de todas as cartas legais)
e `npm run audit` (dano variável). Prioridade = impacto na sugestão × frequência no meta.

## 1. Leitura do texto das cartas
Das **2.776 frases de efeito** das cartas legais, **36%** são entendidas por alguma parte da ferramenta.

| Efeito não classificado | Frases | Cartas | Exemplo | Prioridade |
|---|---|---|---|---|
| Desvantagem do próprio ataque (não ataca no próximo turno, descarta energia, dano em si mesmo, recebe +dano) | 232 | 216 | Iron Leaves ex, Latias ex, Mabosstiff | **Alta** |
| Condições especiais (sono, paralisia, confusão, queimadura, veneno) | 184 | 169 | Munkidori (confusão) | **Alta** |
| Recuo / troca / prender no Ativo | 145 | 132 | Latias ex (recuo 0), Yveltal (não pode recuar), Iron Leaves ex | **Alta** |
| Energia (mover, devolver, descartar a própria, bônus por energia extra) | 133 | 126 | Energy Switch, Iron Leaves ex, Raging Bolt ex | **Alta** |
| Cura | 108 | 96 | — | Média |
| Colocar contadores de dano (fora "mover") | 93 | 82 | Dragapult ex (6 no banco), Yveltal, Risky Ruins | **Alta** |
| Mão (descartar/revelar a do oponente, descartar a sua) | 71 | 68 | Unfair Stamp, Espeon ex | Média |
| Voltar à mão / embaralhar no deck (o seu ou o do oponente) | 66 | 58 | Meowth ex (Tuck Tail), Lillie's | Média |
| Moinho / topo do deck | 54 | 53 | Durant ex, Drakloak | Baixa |
| Imunidade a efeitos | 52 | 51 | Sinistcha, Iron Crown ex | Média |
| Dano em vários / no banco (fora "N de dano em 1 do banco") | 40 | 39 | Mew ex (usa ataques do banco) | Média |
| Evolução (acelerar, evoluir da mão/deck) | 39 | 37 | Phantump | Média |
| Banco (tamanho, colocar Pokémon do descarte) | 35 | 32 | Area Zero Underdepths (banco 8) | Média |
| Estádio/Ferramenta como condição de dano | 27 | 20 | Chi-Yu, Vivillon | Baixa |
| HP extra / alterar HP | 23 | 23 | **Hero's Cape (+100 HP)**, Gravity Mountain | **Alta** |
| Prêmios (pegar a mais, virar prêmio) | 20 | 18 | Togekiss, Briar | Média |
| Copiar ataques | 17 | 17 | Mew ex, Zoroark (Foul Play) — N's Zoroark ex já coberto | Média |
| Mudar Fraqueza/Resistência | 5 | 5 | **Lillie's Clefairy ex (Dragão fraco a Psíquico)** | Média |
| Outros (reduções com texto fora do padrão, "nocauteado no fim do turno"…) | 380 | 329 | Tangrowth, Pinsir | Média |

Dano variável: **65%** dos 468 ataques com "+"/"×" são calculados com precisão; o resto vale o mínimo (não é chutado).

## 2. Simulador da corrida de prêmios
- **Prêmios pelo banco** (Dragapult ex, Phantom Dive): o simulador só conta nocautes no Ativo. Contra spread o resultado fica otimista.
- **Desvantagens de ataque** do oponente e suas (Iron Leaves/Latias "não ataca no próximo turno"): ignoradas; atacam todo turno.
- **HP extra de Ferramenta** (Hero's Cape: Kangaskhan com 400 HP) e **redução de dano** ("recebe 30 a menos"): ignorados, salvo muralhas.
- **Disrupção do oponente** (trava de Itens, Unfair Stamp, Crushing Hammer) não entra na corrida; só no diagnóstico.
- **Condições especiais** (confusão, dano de veneno entre turnos), **cura**, **troca/recuo** e **efeitos de Estádio** (Risky Ruins, Area Zero) ignorados.
- **Ordem dos turnos** (quem começa, restrições do 1º turno), **setup** e **sorte** (moedas pela média; mão sempre ideal).
- **1 Supporter por turno**: Boss's Orders não compete com Supporter de compra; Boss é um orçamento fixo.
- **Habilidades "1 vez por turno"** (Pecharunt, Munkidori) supostas sempre disponíveis, inclusive o Munkidori ter contadores para mover.
- **Copiar ataques** (Mew ex) e **mover energia** (Iron Leaves ex, Energy Switch) ignorados.

## 3. Simulador de consistência
- Conta só Supporters de compra; **ignora habilidades de compra** (Kangaskhan, Fezandipiti, Drakloak) e **buscas por Pokémon** (Toxel "Call for Family", Tatsugiri, Meowth ex).
- Ignora o **custo de descarte** (Ultra Ball, Secret Box), Rare Candy e **reset de mão do oponente** (Judge, Unfair Stamp).
- Não mede **trava de Itens** no setup (Budew no turno 1).

## 4. Custos e encaixe da troca
- **Conflito de Estádio** (o seu × o da tech × o do oponente sobrescrevendo) e **conflito de Ferramenta** (1 por Pokémon: Binding Mochi × Hero's Cape).
- **Recuo da tech** e se há troca disponível para ela entrar/sair.
- Cortes avaliados **só neste matchup**: não mede o que a carta cortada faz nos outros matchups.
- ACE SPEC: não compara **numericamente** a atual (Unfair Stamp) com a sugerida.
- Desvantagem do ataque da tech (Mabosstiff recebe +100) não entra no risco.
- Fraqueza da tech a atacantes do oponente só entra pela análise de muralha/risco simplificada.

## 5. Diagnóstico (eixos que ainda não existem)
- **Velocidade / pressão cedo** (deck que bate forte no turno 2).
- **Prêmios pelo banco** como plano do oponente (spread).
- **Cura / stall**, **moinho / deck out**, **lock de condições** (paralisia em loop), **prender no Ativo**.
- **Mudança de fraqueza** (Lillie's Clefairy ex), **cópia de ataque** (Mew ex), **mecânicas de virada** (Rosa's, Briar, "se você tiver mais prêmios").
- **Dependência de Ferramenta** do oponente (Hero's Cape) como alvo de Tool hate.

## 6. Dados
- TCGdex: set 30th sem regulation mark (override manual); ~25 imagens faltando; marca em minúsculo (`mep-051`).
- **Tera, Ancient e Future são listas manuais e incompletas** (a API não informa).
- Energias especiais às vezes marcadas como "Normal" pela API.
- Nomes em português: 3.050 de 3.217 cartas.
- Arquétipo do deck não é identificado/nomeado.

## 7. Leitura das listas e do contexto
- Parser: só o formato do TCG Live/Limitless; nomes em português nas listas não são aceitos.
- Contexto: por palavras-chave; não entende negação ("isso não é problema"), inglês, gírias ("gust", "OHKO", "wipe"), nem sequência de jogadas.

## 8. Fora do motor (produto e dados de torneio)
- Sem dados de torneio (Limitless): sem taxa de vitória real, sem "o que os vencedores jogam", sem lista base.
- Sem camada de IA na hora da consulta (aguardando chave da API do Claude).
- Sem botão "reportar erro", sem link para compartilhar uma análise, sem análise contra o meta inteiro.

## Ainda em aberto depois da rodada 1
- **Texto (44% restantes):** "Outros" (380 frases de texto fora do padrão), energia (120), recuo/troca (78), contadores (76),
  voltar à mão (66), condições (60, as condicionais), mão (55), moinho (54), imunidade (51), evolução (37).
- **Simulador:** dano de veneno/queimadura entre turnos e confusão; cura durante a corrida; custo de recuo/troca;
  1 Supporter por turno (Boss × compra); quem começa e sorte de compra; tempo de evolução do SEU lado.
- **Consistência:** trava de Itens e reset de mão do oponente dentro da simulação de mão; Rare Candy.
- **Custos:** impacto do corte em outros matchups; comparação numérica da ACE SPEC atual × sugerida; recuo da tech.
- **Diagnóstico:** velocidade, cura/stall, moinho, lock de paralisia, mecânicas de virada (Rosa's, Briar).
- **Dados:** ~~listas Tera/Ancient/Future manuais~~ (resolvido na rodada 2 com a Pokémon TCG API).
- **Produto:** IA na hora da consulta, dados da Limitless, botão "reportar erro", link de análise, análise contra o meta.

## Ordem sugerida
1. Simulador: prêmios pelo banco, desvantagens de ataque, HP extra/redução de dano, disrupção do oponente.
2. Texto: desvantagens de ataque, condições especiais, recuo/troca, mover energia, colocar contadores.
3. Consistência: habilidades de compra e buscas por Pokémon; custo de descarte.
4. Custos: conflito de Estádio e Ferramenta; impacto do corte em outros matchups.
5. Camada de IA + dados da Limitless para a cauda longa.


## Tipos de pedido que a ferramenta entende (campo "qual é a sua dor?")
| O jogador escreve… | A ferramenta entende | Análise que roda |
|---|---|---|
| "morro em um hit", "OHKO", "não aguento" | seu atacante cai rápido | quem te mata em 1 ataque; muralhas; HP extra que faz sobreviver |
| "corrida de prêmios", "entrego 3, pego 2", "prize trade" | corrida de prêmios | simulador turno a turno; redutores de prêmio; atacantes de 1 prêmio |
| "matar X todo turno", "consistência de matar", "não mato" | margem de nocaute / falta dano | dano sozinho × com combo contra o atacante dele; peças necessárias; dano extra e HP reduzido |
| "carimbo", "martelo", "trava meus itens", "iono", "spread" | o oponente te atrapalha | eixos de disrupção (Itens, mão, energia, banco, prender, habilidades) e counters |
| "dificultar a vida dele", "travar", "atrapalhar" | você quer atrapalhar | trava de Itens/habilidades, custo de ataque maior, remoção de energia/estádio |
| "lento", "setup", "brick", "não monto" | consistência | (peso nas sugestões; simulação de mão por troca) |
| "ACE SPEC", "Legacy" | troca de ACE SPEC | ACE SPECs que resolvem o diagnóstico |
| "os Pokémon do N", "do Lupo", "da Equipe Rocket", "zoroark do N" | cita o grupo de um Treinador | marca todas as cartas daquele dono no deck dele (ou no seu) como citadas |
| nomes de cartas (inglês ou português) | ameaças citadas | prioriza counters que cobrem essas cartas |

Ainda NÃO entende: sequência de jogadas ("depois que ele faz X eu faço Y"), comparações ("melhor que"), pedidos fora dessas categorias —
casos para a camada de IA na hora da consulta.
