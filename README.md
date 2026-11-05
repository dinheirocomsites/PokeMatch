# Tech Finder TCG ⚡

Cole a sua lista de Pokémon TCG e a lista do deck que você quer vencer: a ferramenta lê
**todas as cartas legais no Standard** (marca H em diante) e sugere as tech cards que viram o matchup,
explicando o porquê, o quanto cabem no seu deck e o que cortar.

## Rodar
```bash
npm run sync   # baixa a base de cartas do TCGdex (data/cards.json)
npm start      # http://localhost:3000
npm test
```
Sem dependências: só Node.js 22+.

## Como funciona
1. **Base** (`scripts/sync-cards.js`): baixa do TCGdex as cartas com regulation mark ≥ `MIN_MARK` (`src/config.js`).
2. **Parser** (`src/parser.js`): lê o formato de exportação do TCG Live e valida 60 cartas, 4 cópias, ACE SPEC e legalidade.
3. **Etiquetas** (`src/tags.js`): lê habilidades/ataques/treinadores e extrai counters com o alvo
   (ex.: Farigiraf ex → "previne dano de Pokémon Básicos ex").
4. **Perfil** (`src/profile.js`): de onde vem o poder de ataque do oponente, fraquezas, dependência de habilidades/itens/estádio.
5. **Motor** (`src/engine.js`): nota = impacto no matchup × encaixe no seu deck (energia, evolução, busca, prêmios) + sugestão de cortes.

Dados das cartas: [TCGdex](https://tcgdex.dev).
