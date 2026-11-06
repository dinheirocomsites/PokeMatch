# PokeMatch — o que a ferramenta ainda NÃO valida ou classifica

Levantamento de 06/11/2026. Números da auditoria `npm run audit:coverage` (texto de todas as cartas legais)
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
| Copiar ataques | 17 | 17 | Mew ex, Zoroark (Foul Play) | Média |
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

## Ordem sugerida
1. Simulador: prêmios pelo banco, desvantagens de ataque, HP extra/redução de dano, disrupção do oponente.
2. Texto: desvantagens de ataque, condições especiais, recuo/troca, mover energia, colocar contadores.
3. Consistência: habilidades de compra e buscas por Pokémon; custo de descarte.
4. Custos: conflito de Estádio e Ferramenta; impacto do corte em outros matchups.
5. Camada de IA + dados da Limitless para a cauda longa.
