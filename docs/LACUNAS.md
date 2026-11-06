# PokeMatch — o que a ferramenta ainda NÃO valida ou classifica

## Progresso
| Rodada | Frases de efeito entendidas | Dano variável | Testes |
|---|---|---|---|
| Levantamento inicial | 36% | 65% | 42 |
| Rodada 1 (simulador, texto, consistência, custos) | 56% | 65% | 49 |
| Rodada 2 (subtipos oficiais, custo de ataque, margem de nocaute) | 56%+ | 65% | 51 |
| Rodada 3 (Pokémon de Treinador: N, Lupo/Hop, Equipe Rocket…) | 58% | 65% | 62 |
| Rodada 4 (simulador realista + eixos novos de diagnóstico) | 58% | 66% | 72 |
| Rodada 5 (régua nova + leitor genérico de condições de dano) | 79% lido · 69% usado · 8% testado | 100% | 84 |
| Rodada 6 (famílias que mudam o cálculo + buscas na simulação de mão) | 87% lido · 80% usado · 13% testado | 100% | 96 |
| Rodada 7 (camada de IA rodando: Claude lê, motor confere) | **99% lido · 84% usado · 13% testado** (336 frases via IA) | 100% | **102** |

### Padrão de erro: "contar energia sem olhar de QUEM e QUAL" (corrigido para todas as cartas)
**Caso (Felipe, espelho do Sharpedo)**: Diancie sugerida com *"240 + 30 = 270 → nocauteia em 1 ataque"*. O texto é *"40 damage for each **Special** Energy attached to all of your **opponent's** Pokémon"* — e a lista dele só tem Darkness Energy **básica**: o dano real é **0**.
**Padrão**: o mesmo do Dragon Elixir, agora em contagens. Uma regra genérica ("para cada energia ligada" → 3) engolia 46 frases diferentes e jogava fora o **lado** (este Pokémon / os seus / os do oponente / os dois Ativos) e o **tipo** (Especial, Básica, {X}). Além disso, o cálculo de dano só recebia o deck de quem ataca — não tinha como saber o que o defensor joga.
**Correção geral** (`energyEach` em `src/damage.js`): todo cálculo de dano recebe também o deck de quem defende (`defDeck`); a contagem confere no deck do lado certo — **0 se aquele deck não joga esse tipo de energia**; Energia Especial conta poucas na mesa (1 a 3, pelo número de cópias); {X} do oponente conta a proporção que o deck dele joga; a energia nova que vem no pacote da própria tech conta. Deck do defensor desconhecido → mantém a estimativa antiga (não zera por falta de informação).
Varredura (36 confrontos entre os decks de teste): 27 iguais; nos 9 que mudaram, saíram só sugestões com dano inventado — Diancie era **nº 1** contra decks sem Energia Especial (Rocket × Slowking: nota 60), Sunflora contava 3 {R} num deck com 6 Fire em 15 energias, Coalossal contava 3 {R} num deck sem Fogo (280 → 40). Diancie continua contra o Slowking, que joga 6 Energias Especiais.
**Achado junto**: 18 dos 36 confrontos **travavam o motor** (no site, a análise não aparecia): quando nenhum atacante conseguia jogar numa linha da simulação, ela não registrava resultado e a análise quebrava. Agora a linha fecha como "travada". Teste: `test/energy-side.test.js`.

### Padrão de erro: "ler o efeito e esquecer o alvo" (corrigido para todas as cartas)
**Caso**: Dragon Elixir aparecia como resposta ao dano no banco do Slowking. O texto é *"Heal 60 damage from your **Active** **{N}** Pokémon"*: só cura o **Ativo**, só **Dragão** — e o único Dragão do Sharpedo (Tatsugiri) fica no banco.
**Padrão**: o motor guardava *o que* o efeito faz (cura 60) e jogava fora *em quem* e *onde*; quem usava o efeito supunha o alvo mais favorável. O mesmo erro já tinha aparecido no Seviper ("ataques **deste** Pokémon"), nos Fósseis Antigos ("**este** Pokémon não é afetado") e na Lilligant ("seus **{G} e {R}**") — cada um tinha sido remendado sozinho.
**Correção geral** (`src/target.js`): todo efeito de apoio/defesa leva um **alvo** lido do texto — lado, posição (Ativo / banco / ele mesmo / quem tem a carta / qualquer), tipo, estágio, Rule Box, dono — e todo uso confere:
- **requisito**: nenhum Pokémon seu serve → bloqueado; só serve um Pokémon que não fica no Ativo (efeito "no Ativo") → peso baixo; não alcança o seu atacante → peso menor;
- **resposta a dano no banco** só conta se o efeito alcança o banco e os Pokémon certos; **cura** só ajuda contra o que não nocauteia de um golpe;
- **resposta a paralisia/prender/perder energia** só conta se alcança quem fica no Ativo;
- **HP extra** só vale se a Ferramenta serve no seu atacante (tipo/estágio/dono).
Varredura: das 323 cartas de apoio/defesa, no deck Sharpedo 7 mudaram de veredito (2 bloqueadas: Magnetic Metal Energy, Growing Grass Energy; 5 com peso menor: Dragon Elixir, Latias ex…); nos matchups de referência só mudaram as sugestões que estavam erradas (curas contra o Trifrost, energias de tipo que o deck não tem).

**Correção do Felipe (mesmo dia)**: (1) o Tatsugiri **vai para o Ativo** — a habilidade "Attract Customers" só funciona lá; agora quem tem habilidade "se este Pokémon estiver no Ativo" (29 Pokémon) conta como "vai para o Ativo". (2) O motivo real de o Dragon Elixir não servir contra o Slowking é que **o Trifrost faz 110 em 3 Pokémon, cedo, e os Básicos de 70–110 HP morrem de um golpe** — curados ou não. Regra: **carta de defesa só vale se muda o resultado contra o golpe real** (cura não salva quem cai de um golpe; HP extra só vale se passa do dano). As dicas agora saem por ataque, com os Básicos do começo do jogo (Toxel, não Toxtricity), e "só em Pokémon ex" não conta quem não é ex.

### Rodada 7 — primeira leitura real (06/11/2026)
- **336 frases** classificadas (24 ficaram de fora da resposta e vão na próxima sincronização, automaticamente).
- **263 efeitos aceitos** pelo validador: 91 frases com efeito tático (contadores, dano extra, desvantagem, mão do oponente, prêmios, redução, trava, condição, troca…) e o resto com resumo "sem efeito tático na análise".
- **82 rejeitados** (o filtro funcionando): tipo que não aparece no texto (ex.: Pinsir "nocauteado no fim do turno" classificado como contadores), número que não existe na carta, condição especial trocada.
- **Custo real**: US$ 1,15 (a primeira tentativa, US$ 1,19, se perdeu porque o workflow testava antes de salvar — corrigido: agora salva antes).
- **Correção depois da revisão**: a IA marcou bônus "deste Pokémon" (Seviper +120, Annihilape, Feraligatr) como dano extra para qualquer atacante — o Seviper subiu para 1º contra Dragapult. O motor agora confere **a quem** o bônus vale no texto: "deste Pokémon" → só ele; "seus Pokémon {G} e {R}" → só esses tipos; "se você tiver…" → condição (vale metade).

### Rodada 7: camada de IA (pronta, aguardando a chave)
**Como funciona**
1. `npm run classify` (ou o passo do GitHub Actions) pega as frases que as regras não entendem (hoje 360) e manda ao Claude (Opus 5.5) em lotes, com o texto inteiro da carta para contexto.
2. O Claude responde em **saída estruturada**: só pode usar os tipos de efeito que o motor sabe usar (dano extra, redução, cura, contadores, condição, travas, retaliação, evolução, prêmios…) ou "sem efeito tático", sempre com um resumo em português.
3. **O motor confere cada resposta** (`src/llm-effects.js`): o tipo precisa aparecer no texto da carta, o número precisa existir no texto (dano ou contadores ×10), condição especial precisa bater, moeda no texto vira condição "moeda". O que não passa fica **rejeitado com o motivo** e não entra no cálculo.
4. O resultado vai para `data/llm-effects.json` (cache): cada frase é paga **uma vez**; nas próximas sincronizações só vão as frases de cartas novas.
5. As sugestões que usam um efeito lido pela IA dizem isso: "(efeito lido pela IA e conferido pelo motor)". A auditoria mostra quantas frases vieram da IA.

**Segurança e custo**: a chave nunca vai para o site nem para o código — fica num **segredo do GitHub** (`ANTHROPIC_API_KEY`). Sem a chave, o passo não roda e o site segue só com as regras. Custo estimado da primeira leitura: **~US$ 2,40** (`npm run classify:dry` mostra a estimativa antes de gastar).

**Para ligar**: no GitHub, PokeMatch → Settings → Secrets and variables → Actions → New repository secret → nome `ANTHROPIC_API_KEY`, valor = sua chave da API do Claude. Depois: Actions → Site → Run workflow.

### Coberto na rodada 6
Das 578 frases que sobravam, 408 apareciam em **uma carta só**. Em vez de uma regra por carta, a rodada atacou **famílias** e só contou como "usado" o que entra num cálculo:
- **Retaliação** ("põe N contadores no Pokémon que atacou": Iron Jugulis, Bruxish, Iron Boulder ex, Deluxe Bomb…): no simulador, quem ataca leva os contadores (e pode cair por eles); vale nos dois lados.
- **Aguenta com HP cheio** (Pikachu ex, Crustle): não cai de um ataque só — fica com 10 HP e o nocaute vai para o ataque seguinte (nos dois lados).
- **Tirar o Ativo dele para o banco** (Hippopotas, Repel…) e **puxar** viram resposta à trava "enquanto estiver no Ativo" (Arbok) e às muralhas.
- **Evolução do oponente**: trava (Bronzong), pune (Ampharos da Equipe Rocket: 40 por evolução) e desfaz (Espathra, Espeon ex, Claydol) — valem contra decks de Estágio 1/2 e entram no pedido "dificultar a vida dele".
- **Copiar o ataque dele** (Zoroark "Foul Play": usa o Phantom Dive do Dragapult = 200).
- **Habilidade que nocauteia o próprio Pokémon** (Dusknoir): risco, dá prêmio ao oponente.
- **Veneno forte** ("2 contadores em vez de 1") e **queimadura/veneno por habilidade** (Volcarona) no Checkup; **energia de volta para a mão dele** e **carta aleatória da mão** como disrupção; **cortina de fumaça** (só ataca se acertar a moeda); **trava do ataque escolhido**; **tirar um Pokémon dele de jogo** sem nocaute; **trava de ligar energia**; redução enquanto Ativo; Ferramentas que zeram o recuo como troca.
- **Buscas genéricas na simulação de mão**: qualquer carta, Pokémon {X}, Evolução/Estágio, Ferramenta, Item, Estádio, energia {X}.
- **Simulador sempre termina**: oponente sem Pokémon (ou travado sem conseguir atacar) fecha o jogo; antes, a análise podia ficar sem resultado nesses casos.

**O que sobra (360 frases, ~13%)**: quase tudo é efeito único — Pinsir/Glaceon (nocaute no fim do turno dele), Cresselia (virar prêmio), Dipplin (atacar 2 vezes), Relicanth (usar ataque da pré-evolução), Alakazam/Sableye (mover contadores do oponente), Ogre's Mask… Para esses, o caminho é a camada de IA lendo o texto na hora (com o motor conferindo o que dá).

### Rodada 5: a régua mudou (e ficou mais honesta)
A cobertura agora é medida em **3 níveis** (`npm run audit:coverage`):
- **lido** — alguma parte da ferramenta reconhece a frase;
- **usado** — o que foi reconhecido muda a nota, o diagnóstico ou a simulação (ex.: "search your deck for…" genérico é só *lido*: nem toda busca entra na simulação de mão);
- **testado** — a carta tem teste próprio (ainda baixo: 8%; os testes validam a REGRA com 1 carta real, não cada carta).

Também passou a contar o efeito **inteiro**: frases de ligação ("Once during your turn, you may use this Ability.") e pedaços que dependem da frase anterior ("If heads, …", "prevent that damage.") contam junto com o efeito. O texto da API vinha com HTML (`<em>`, `<span class="energy-symbol">`), agora limpo ({L}, {R}…).

**Coberto na rodada 5**
- **Leitor genérico de condições de dano** ("If …, this attack does N more damage"): estima, pelo seu deck e pelo alvo, a chance de a condição valer — energia {X} ligada, energia extra, Ferramenta, Estádio em jogo, Pokémon citado no banco, Tera no banco, custo de recuo e Resistência do alvo, prêmios restantes, tamanho da mão, carta jogada no turno, carta no descarte… Condição desconhecida **não chuta** (vira lacuna). Resultado: **468 de 468** ataques de dano variável lidos (eram 310).
- **Multiplicadores novos**: {C} no recuo do alvo, cartas na mão, Pokémon por nome/estágio/tipo em jogo ("for each of your Drifloon and Drifblim"), cartas descartadas pelo próprio ataque ("Discard up to 2 {M} Energy… 120 for each"), revelar o topo do deck.
- **Bônus opcional** ("You may do 100 more damage. If you do, …") entra com a desvantagem anotada.
- **Contadores não são dano**: ataque que coloca contadores ignora fraqueza, resistência e redução.
- **Ataque que puxa do banco** (Dipplin, Malamar…): no simulador, nocauteia no banco **sem gastar Boss**.
- **Proteção e trava do próprio ataque** no simulador: "no próximo turno dele, recebe 30 a menos / ataques do Defensor causam 30 a menos" e "o Pokémon Defensor não pode atacar" (sem moeda).
- "Isn't affected by Weakness" × "…by Resistance" separados; redução fixa de habilidade com texto entre parênteses (Tangrowth, Mudsdale…) que antes escapava.
- Requisito **"descarte X da mão para usar"** (Meowstic sem Chill Teaser Toy, Volcarona sem energia {R}); compra de 1 carta ("Draw a card") na consistência; mover energia do próprio Pokémon.

**Maiores famílias que sobram (578 frases)**: outros/únicos (≈200), energia (mover/devolver), voltar à mão/deck, contadores (mover, no banco), recuo/troca, condições especiais (confusão/sono no próprio), evolução, mão do oponente. Ver `npm run audit:coverage`.

### Coberto na rodada 4
**Simulador da corrida de prêmios**
- **Nocaute em 2 ataques**: o dano fica no Pokémon dele (antes, só contava nocaute de 1 ataque do seu lado). Ex.: Zoroark faz 170 no Pecharunt ex (fica com 20 HP) e termina no ataque seguinte.
- **Tempo de evolução**: atacante Estágio 1/2 só ataca no seu 2º turno → o oponente ataca antes, no Básico que vai evoluir (nocauteia = prêmio para ele; dano = continua depois de evoluir) e o Estágio 2 dele fica pronto 1 turno antes.
- **Pokémon Checkup**: veneno (10) e queimadura (20) entre os turnos, com os extras do deck (Pecharunt +50 se Ativo, Magmortar +30, Perilous Jungle +20); o veneno do seu próprio combo (Pecharunt ex troca e envenena) também machuca o seu atacante. Efeito com moeda não conta.
- **Boss de verdade**: Supporter/Item que puxa conta 1; com moeda ou só Básico (Pokémon Catcher, Lisia's) conta ½; Giovanni só com Pokémon da Equipe Rocket; ataque que puxa não conta como "Boss".

**Diagnóstico (eixos novos)**
- **Trava de Pokémon com Habilidade vindos da mão** (Team Rocket's Arbok no Ativo): lista as suas cartas travadas (no banco e evoluindo) e a saída (Boss manda o Arbok para o banco). Do seu lado, o Arbok vira tech para "dificultar a vida dele" (ex.: contra Dragapult, trava a evolução para Drakloak).
- **Pressão cedo**: quem nocauteia os seus Básicos de setup com 1 energia (1º turno dele) ou 2 (2º turno); conta só o dano base no começo. Counter: Básico sem Rule Box, HP alto e recuo barato para começar.
- **Cura / stall**: só pesa quando o seu atacante precisa de 2 ataques no atacante dele.
- **Moinho**: cartas que descartam o topo do seu deck; counter: recuperação para o deck (Energy Recycler…).
- **Paralisia / sono**: counters = troca e cura de condição que vale para o seu atacante (Pokémon Center Lady, Festival Grounds; os Fósseis Antigos não contam: só protegem a si mesmos).
- **Virada**: Briar, Acerola's Mischief, Lacey, Special Red Card, Counter Gain… com dica de não parar em 2 prêmios restantes contra Briar.
- Pedido "dificultar a vida dele": travas de Itens/habilidades/Supporters/Pokémon da mão passam a contar como solução.

**Ainda não**: o oponente cura durante a corrida; troca/recuo como custo; quem começa (o simulador supõe que você vai 2º com atacante Básico); Wobbuffet/Orbeetle da Equipe Rocket movendo contadores (o requisito de dono já é conferido, o dano não).

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

> Nota (rodada 4): as seções 2–5 acima são o levantamento original; boa parte já foi coberta nas rodadas 1–4 (veja "Coberto na rodada …" no topo).

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
| "dificultar a vida dele" (contra deck de habilidades) | você quer atrapalhar | inclui travas: Itens, habilidades, Supporters e Pokémon com Habilidade vindos da mão (Arbok) |
| nomes de cartas (inglês ou português) | ameaças citadas | prioriza counters que cobrem essas cartas |

Ainda NÃO entende: sequência de jogadas ("depois que ele faz X eu faço Y"), comparações ("melhor que"), pedidos fora dessas categorias —
casos para a camada de IA na hora da consulta.
