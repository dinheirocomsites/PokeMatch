# Avaliação do estrategista (2026-11-06, modelo claude-opus-5-5)

A IA lê o matchup; o motor confere cada afirmação (✅ confirmada, ❌ derrubada, ❔ não deu para conferir).

## Sharpedo × Slowking/Kangaskhan (caso reportado)
**Dor:** Morro para o kyurem e depois nao volto mais

**Plano do oponente (IA):** O dano real vem do Slowking, não do Kyurem. O oponente usa Ciphermaniac's Codebreaking ou Academy at Night para colocar Kyurem ou Zeraora no topo do deck. Depois o Slowking usa Seek Inspiration por {P}{C}, descarta esse topo e copia Trifrost (110 em 3 Pokémon seus) ou Thunder Raid (210 em um ex do seu banco). Como você não tem cartas Colress, o Plasma Bane não liga e o Kyurem sozinho não ataca: ele é só munição no topo do deck. Trifrost descarta todas as energias, mas a Boomerang Energy volta para o Slowking e a Wondrous Patch devolve Psychic do descarte. Assim ele recarrega rápido. Mega Kangaskhan ex fecha o jogo batendo 200+ no Ativo.

**O seu problema (IA):** Um Trifrost no começo varre seus Carvanha e Toxel do banco. Sem básicos para evoluir, você não tem o segundo nem o terceiro Mega Sharpedo ex, e o deck trava. — Seu deck depende de vários básicos de 70 HP parados no banco (Carvanha, Toxel, Tatsugiri) mais Munkidori de 110. Isso é exatamente o que o Trifrost copiado (110 em 3) mata. Ele leva até 3 prêmios por ataque, contra uma evolução que só ataca no seu 2º turno. Depois o Thunder Raid copiado pega Pecharunt ex ou Fezandipiti ex no banco, e você perde o motor de energia e de troca. Esse ciclo se repete porque Boomerang Energy e Wondrous Patch recarregam o Slowking e o topo do deck é escolhido por ele.

**Afirmações conferidas pelo motor** (6/6 confirmadas, 0 derrubadas):
- ✅ Slowking copia Trifrost e nocauteia Carvanha (70 HP). — _110 de dano (em vários Pokémon) contra 70 HP → nocauteia_
- ✅ Slowking copia Trifrost e nocauteia Munkidori (110 HP). — _110 de dano (em vários Pokémon) contra 110 HP → nocauteia_
- ✅ Slowking copia Trifrost e nocauteia Toxel (70 HP). — _110 de dano (em vários Pokémon) contra 70 HP → nocauteia_
- ✅ Slowking copia Thunder Raid e nocauteia Pecharunt ex no banco (190 HP). — _210 de dano (no banco) contra 190 HP → nocauteia_
- ✅ Slowking consegue usar Trifrost via Seek Inspiration pagando {P}{C}. — _paga {P}{C} com as energias do deck (copiado do Kyurem)_
- ✅ Boomerang Energy está na lista e volta para o Slowking depois do Trifrost. — _a carta está na lista_

**Techs sugeridas pela IA:**
- ✅ **Shaymin** — A versão com Flower Curtain impede dano de ataques nos seus Pokémon de banco sem Regra. Isso anula o Trifrost no banco (Carvanha, Toxel, Munkidori, Tatsugiri, Yveltal). Ele não é {C}, então Team Rocket's Watchtower não desliga a habilidade. Não protege os ex contra Thunder Raid. — _o motor também sugere (nota 42; responde a dano no seu banco)_

**Como jogar (IA):**
- Nunca encha o banco de básicos de 70 HP de uma vez. Baixe 1 ou 2 Carvanha e guarde o resto na mão para evoluir depois do Trifrost. Poffin trazendo 2 básicos frágeis é convite ao Trifrost.
- Slowpoke e Slowking têm fraqueza Darkness: Yveltal (Dark Feather 110x2) ou qualquer ataque {D} mata o Slowking. Use Boss's Orders no Slowking/Slowpoke antes de ele atacar, mesmo valendo só 1 prêmio.
- Munkidori pode mover 3 contadores para um Slowpoke (80 HP). Com Mochi ou um ataque pequeno ele cai antes de evoluir.
- Judge e Unfair Stamp embaralham o deck dele e destroem o topo arrumado por Ciphermaniac's Codebreaking. Use logo depois que ele montar o topo.
- Só desça Pecharunt ex e Fezandipiti ex quando for usar na hora. No banco são alvo de Thunder Raid copiado (210).
- Trifrost no seu Mega Sharpedo ex de banco (330 HP) deixa contadores e liga o Hungry Jaws (+150). Deixe o Sharpedo absorver: ele não morre e ainda fica mais forte.
- Para matar Mega Kangaskhan ex (300): Hungry Jaws com dano faz 270, e você completa com Munkidori (+30) ou Binding Mochi com Pecharunt envenenando (+40).
- Team Rocket's Watchtower desliga Run Errand do Kangaskhan e Last-Ditch Catch do Meowth ex, o que corta a compra dele.
- Guarde Night Stretcher para recuperar Carvanha e reconstruir depois do Trifrost.

**Onde a IA discorda do motor:**
- A simulação 6×4 é otimista demais. Ela trata o Trifrost como um evento único, mas Boomerang Energy, Wondrous Patch e Ciphermaniac/Academy permitem repetir o ataque. A simulação também ignora que, sem Carvanha restante, você não tem o segundo Mega Sharpedo ex. É exatamente a sua dor: 'não volto mais'.
- Na T1 a simulação dá 340 de dano ao Mega Sharpedo ex sem explicar a fonte. Sem contadores, Hungry Jaws faz só 120 (160 com Mochi). Os 270 exigem que o Sharpedo já tenha dano.
- O Kyurem não é o atacante: sem cartas Colress no seu descarte, Plasma Bane não liga. O alvo prioritário deve ser o Slowking, não o Kyurem.

**Incerteza (IA):** Não confirmei a versão exata e a legalidade atual do Shaymin com Flower Curtain no Standard. Também não sei com que frequência o oponente encontra o Kyurem no topo sem Ciphermaniac na mão. A Academy at Night exige ter a carta na mão.

_Custo: US$ 0.135 (8454 tokens de entrada, 5072 de saída)._

## Sharpedo × Dragapult
**Dor:** Preciso ter mais consistencia de matar o pult com o sharpedo todo turno, e se eu puder dificultar a vida dele seria uma boa tbm

**Plano do oponente (IA):** Dragapult ex chega pela linha Dreepy → Drakloak → Dragapult ex. A partir do T2-T3 ele usa Phantom Dive (200 no Ativo + 6 contadores no seu banco) para pegar prêmios no banco e no Ativo ao mesmo tempo. Budew trava seus Itens no começo. Drakloak (Recon Directive), Dudunsparce (Run Away Draw), Meowth ex e Fezandipiti ex dão consistência. Crushing Hammer, Judge e Unfair Stamp atrasam você. O Munkidori dele (com Darkness) move até 3 contadores para fechar contas.

**O seu problema (IA):** O Hungry Jaws danificado faz 270 e o Dragapult ex tem 320 HP. Mesmo com Gravity Mountain (290) faltam 20. Você só tem 1 Gravity Mountain e 3 Binding Mochi, então nem todo turno a conta fecha. — Hungry Jaws precisa de contador no Sharpedo para fazer 270. As fontes desse dano são: Itchy Pollen/ataques dele, Reckless Charge do Carvanha antes de evoluir, ou veneno de um turno anterior. O veneno só bate no checkup, então o Sharpedo que entra via Subjugating Chains está envenenado (ativa a Mochi, +40) mas pode estar sem dano. As contas que fecham são: 270+40 (Mochi envenenado) = 310 com Gravity Mountain (290) em jogo. Sem estádio, precisa de 270+40+30 (Munkidori) = 340 ≥ 320. O Munkidori só move dano se tiver Darkness anexada e se algum Pokémon seu tiver contadores. O Phantom Dive dele no seu banco te dá essa munição, e o veneno no Sharpedo também. O Risky Ruins dele pode substituir seu Gravity Mountain.

**Afirmações conferidas pelo motor** (7/7 confirmadas, 0 derrubadas):
- ✅ Dragapult ex paga Phantom Dive com Fire + Psychic (Crispin acelera). — _paga {R}{P} com as energias do deck_
- ✅ Budew trava seus Itens desde o T1 sem custo de energia. — _paga  com as energias do deck_
- ✅ Dudunsparce (Colorless) é motor de compra. Team Rocket's Watchtower desliga a habilidade dele. — _a carta está na lista_
- ✅ Meowth ex (Colorless) busca Supporter. Watchtower também desliga. — _a carta está na lista_
- ✅ 4x Crushing Hammer ameaçam as 2 energias do Sharpedo. — _a carta está na lista_
- ✅ Risky Ruins substitui seu Gravity Mountain e põe 20 nos seus básicos não-Darkness (Munkidori, Tatsugiri). — _a carta está na lista_
- ✅ Dudunsparce ex escala com seus Pokémon ex em jogo. — _paga {C} com as energias do deck_

**Techs sugeridas pela IA:**
- ❔ **Gravity Mountain** — Uma 2ª cópia mantém o Dragapult em 290 com mais frequência e recupera o estádio quando ele joga Risky Ruins. Com 290, Mochi envenenado OU Munkidori já fecham o KO. — _você já joga essa carta_
- ✅ **Kieran** — +30 contra Pokémon ex: 270+30 = 300, fecha o KO no Pult com Gravity Mountain mesmo sem Mochi. Também serve como switch. Custo: ocupa o Supporter do turno (sem Boss). — _o motor também sugere (nota 43; ajuda o Mega Sharpedo ex a nocautear Dragapult ex todo turno)_
- ✅ **Cyrano** — Busca Mega Sharpedo ex e Pecharunt ex sob a trava do Budew, sem depender de Itens. — _o motor também sugere (nota 31; responde a trava de itens)_

**Como jogar (IA):**
- Monte o turno de KO assim: Sharpedo no banco com 2 Darkness (Toxtricity ajuda) e Binding Mochi → Subjugating Chains do Pecharunt (fica envenenado) → Munkidori move 30 → Hungry Jaws. Confira se há contador no Sharpedo ANTES de atacar.
- Garanta dano no Sharpedo: deixe o Carvanha usar Reckless Charge antes de evoluir, ou aproveite os 20 do Itchy Pollen. O veneno de um turno vira dano permanente para o próximo Hungry Jaws.
- O Phantom Dive dele no seu banco é munição do seu Munkidori: mova esses contadores para o Dragapult.
- Priorize Boss nos estágios: Drakloak (90) e Dreepy (70) caem fácil. Use Fezandipiti (Cruel Arrow 100) no banco para impedir que 3 Pults fiquem prontos.
- Jogue Team Rocket's Watchtower cedo para desligar Dudunsparce e Meowth ex. Isso não afeta Drakloak (Dragon) nem seus Pokémon.
- Contra o Budew: no turno livre, use todas as buscas (Poffin, Ultra Ball, Poké Pad) e deixe Mochi e estádio na mão antes da trava.
- Antes de nocautear o Budew, lembre que isso libera o Unfair Stamp dele. Só faça se o ganho compensar e se você tiver Fezandipiti para recomprar.
- Contra Crushing Hammer, não descarregue energia no Sharpedo ativo cedo. Deixe Toxtricity pronta para repor, e Night Stretcher pode voltar Darkness.
- Evite deixar muitos ex no banco quando o Dudunsparce ex estiver ativo (Tenacious Tail).

**Onde a IA discorda do motor:**
- O motor diz 'sozinho faz 270': isso só vale se o Sharpedo já tiver contadores. O veneno do Pecharunt não conta no turno em que entra. Sem dano prévio, são 120 (+40 com Mochi = 160).
- A simulação supõe Gravity Mountain sempre em jogo. Com 1 cópia e Risky Ruins do lado dele, isso não é realista: sem estádio, Mochi sozinho (310) não fecha os 320.
- Kieran e Black Belt's Training ajudam, mas custam o Supporter do turno, que concorre com Boss's Orders. Por isso prefiro uma 2ª Gravity Mountain como solução principal.

**Incerteza (IA):** Não sei se o Munkidori dele terá Darkness a tempo, nem a frequência real de Risky Ruins. Também não sei qual carta cortar para os techs: provavelmente 1 Judge, 1 Watchtower ou Tatsugiri. A simulação de prêmios é simplificada e não considera a trava de Itens em todos os turnos.

_Custo: US$ 0.147 (8102 tokens de entrada, 5725 de saída)._

## Sharpedo × Basic Box
**Dor:** Meu problema é a corrida dos prêmios: morro em um hit para Ogerpon ou Folhas Férreas e perco 3 prêmios de uma vez

**Plano do oponente (IA):** Kangaskhan/Latias é um deck de básicos com retirada grátis (Skyliner do Latias ex). Mega Kangaskhan ex é o atacante padrão: Rapid-Fire Combo faz 200 ou mais e compra cartas com Run Errand. Contra você, o plano real é outro: os atacantes Planta, Teal Mask Ogerpon ex e Iron Leaves ex, exploram a fraqueza do Mega Sharpedo ex. A energia vem de Teal Dance, Crispin, Energy Switch e Rapid Vernier, que move energias do banco para o Iron Leaves ex quando ele entra. Com Boss's Orders e Fezandipiti ex, Wellspring Mask Ogerpon ex e Iron Crown ex, ele também tira peças frágeis do seu banco.

**O seu problema (IA):** Seu atacante vale 3 prêmios e tem fraqueza justamente ao tipo dos dois atacantes dele que valem só 2. Dois Sharpedos derrubados já são 6 prêmios. — A fraqueza ×2 transforma 180 em 360, acima dos 330 do Sharpedo. Myriad Leaf Shower ainda conta as energias do SEU Ativo, e Hungry Jaws exige {D}{D}, então você sempre alimenta o dano dele. Em troca, você nocauteia Ogerpon ou Iron Leaves (210/220 HP) e pega só 2. A troca 3 contra 2 perde a corrida se você só jogar com Sharpedo.

**Afirmações conferidas pelo motor** (5/5 confirmadas, 0 derrubadas):
- ✅ Ogerpon com 3 energias contra Sharpedo com 2 faz 360 e nocauteia. — _360 de dano contra 330 HP → nocauteia_
- ✅ Prism Edge faz 360 com a fraqueza e nocauteia o Sharpedo. — _360 de dano contra 330 HP → nocauteia_
- ✅ 200 garantidos derrubam Pecharunt ex (190). — _250 de dano contra 190 HP → nocauteia_
- ✅ Rapid Vernier move energia para o Iron Leaves e ele ataca no turno em que entra. — _paga {G}{G}{C} com as energias do deck_
- ✅ 4 Energy Switch aceleram a carga dos atacantes Planta. — _a carta está na lista_

**Techs sugeridas pela IA:**
- ✅ **Legacy Energy** — Conta como {D} para Hungry Jaws e não ocupa o slot de ferramenta do Binding Mochi. Uma vez por jogo, o Sharpedo derrubado entrega 2 prêmios em vez de 3, o que quebra a conta 3+3=6. Troque 1 Darkness Energy por ela. — _o motor também sugere (nota 43; vira a corrida de prêmios (derrota → vitória) na simulação)_
- ✅ **Hero's Cape** — Sharpedo vai a 430 HP e sobrevive aos 360 de Ogerpon e Iron Leaves. O custo é perder o Mochi naquele Sharpedo. Use no Sharpedo que vai encarar Planta e nocauteie Kangaskhan com o +30 do Munkidori em vez do Mochi. — _o motor também sugere (nota 39; faz o Mega Sharpedo ex sobreviver a Teal Mask Ogerpon ex e Iron Leaves ex)_

**Como jogar (IA):**
- Prioridade de alvo: Teal Mask Ogerpon ex e Iron Leaves ex. Use Boss's Orders no Ogerpon do banco enquanto ele carrega. Com dano no Sharpedo, Hungry Jaws faz 270 e derruba os dois (210/220).
- Sempre tenha contador de dano no Sharpedo antes de atacar, para Hungry Jaws chegar a 270. Opções: veneno pelo Subjugating Chains do Pecharunt ex (o contador só entra no checkup entre turnos), Reckless Charge do Carvanha ou dano recebido.
- Contra Kangaskhan (300 HP), feche o nocaute com 270 + 30 do Adrena-Brain do Munkidori, ou 270 + 40 do Binding Mochi com o Sharpedo envenenado.
- Latias ex, Mew ex e Iron Crown ex têm fraqueza a Darkness: Hungry Jaws sem dano já faz 240 e derruba todos. São prêmios baratos para Boss's Orders.
- Nunca exponha o segundo Sharpedo se ele tiver Planta pronta. Depois de perder um Sharpedo, Pecharunt ex com Irritated Outburst faz 180 com 3 prêmios dele e 240 com 4, e derruba Ogerpon ou Iron Leaves.
- Iron Leaves não ataca no turno seguinte ao Prism Edge. Aproveite essa janela para usar o Sharpedo com segurança ou derrubá-lo.
- Team Rocket's Watchtower desliga Run Errand (Kangaskhan) e Last-Ditch Catch (Meowth ex), tirando compra dele. Ele só remove o estádio com Chien-Pao.
- Proteja Munkidori e Toxtricity no banco, porque Fezandipiti, Wellspring e Iron Crown vão neles. Não baixe banco à toa.

**Onde a IA discorda do motor:**
- Farigiraf ex: Armor Tail só bloqueia dano de Pokémon Tera. Bloqueia Teal Mask Ogerpon ex, mas não Iron Leaves ex, que não é Tera. Além disso, exige linha de evolução e banco, que você não tem sobrando.
- Acerola's Mischief só pode ser jogada quando o oponente tem 2 ou menos prêmios restantes. Não resolve o primeiro Sharpedo derrubado.
- A simulação põe o Sharpedo atacando com 2 energias e nocauteando no T1 dele. Isso é irreal: precisa evoluir e ter contador de dano para os 270.
- Para fechar Kangaskhan, o Munkidori (+30) também resolve, sem depender só do Mochi.
- Mew ex copiando Prism Edge ou Myriad Leaf Shower não aplica fraqueza Planta, porque Mew é Psychic. Não é ameaça de nocaute ao Sharpedo.

**Incerteza (IA):** Não sei se a lista dele roda mais de 1 Iron Leaves ou Night Stretcher para reciclá-lo, nem a frequência real de Ogerpon carregado no T2. Moltres e Golbat sugeridos pelo motor não foram verificados aqui.

_Custo: US$ 0.171 (8254 tokens de entrada, 6905 de saída)._

---
Custo total desta avaliação: **US$ 0.45**.
