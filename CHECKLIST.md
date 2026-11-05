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
- [ ] Perfil do oponente: básicos ex, Mega, Stage 1/2, tipos, dependência de habilidades/itens/ferramentas/energia especial
- [ ] Perfil do seu deck: tipos de energia, motor de busca, linhas de evolução, possíveis cortes

## Fase 4 — Classificação das mecânicas (o coração)
- [ ] Classificador por regras (regex) lendo o texto de habilidades e ataques → etiquetas de counter
- [ ] 15–20 etiquetas iniciais (bloqueia básico ex, trava habilidade, trava item, ferramenta, energia especial…)
- [ ] Revisão manual das etiquetas das cartas mais relevantes

## Fase 5 — Motor de sugestões
- [ ] Cruzar as fraquezas do oponente com as etiquetas das cartas → nota de impacto
- [ ] Nota de encaixe no seu deck (energia, evolução, busca, slots)
- [ ] Sugerir o que cortar
- [ ] Explicação em PT-BR para cada sugestão

## Fase 6 — Interface web
- [ ] Página com duas caixas (sua lista × deck oponente)
- [ ] Top 5 techs com imagem da carta, nota e explicação
- [ ] Visual com efeito UAAAU 🔥

## Fase 7 — Validação
- [ ] Caso de teste real: Mega Sharpedo ex × Basic Box → precisa encontrar o Farigiraf ex  ⏳ *aguardando as listas reais*
- [ ] Testar com mais 3 matchups do meta
- [ ] Publicar (GitHub + hospedagem grátis)

## Descobertas / decisões
- A flag `legal` dos **sets** no TCGdex está errada (todos aparecem fora do Standard); a das **cartas** está certa. Usamos a regulation mark.
- Legalidade é **por nome**: Ultra Ball SVI (G) pode ser usada porque existe reimpressão legal (MEG, marca I).
- A API não marca Megas como `ex` no campo `suffix` → detectamos pelo nome ("Mega …", "… ex").
- Farigiraf ex — Armor Tail: *previne todo dano causado a ele por ataques de Pokémon Básicos ex*.
