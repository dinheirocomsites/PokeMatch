# Tech Finder TCG — Checklist

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

## Fase 6 — Interface web
- [x] Página com duas caixas (sua lista × deck oponente), salva no navegador
- [x] Top 8 techs com imagem real, nota, impacto/encaixe e cortes
- [x] Visual UAAAU 🔥: carta holográfica que inclina com o mouse, anéis de nota animados, confete, Pokébola de loading

## Fase 7 — Validação
- [x] Caso de teste real: Mega Sharpedo ex × Basic Box → **#1 Crustle, #2 Farigiraf ex, #3 Drednaw** (9 testes ✅)
- [ ] Testar com mais 3 matchups do meta
- [ ] Publicar (GitHub + hospedagem grátis)

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
