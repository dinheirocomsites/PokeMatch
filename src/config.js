// Standard atual: cartas com marca de regulamento H em diante.
// Quando houver rotação, basta mudar MIN_MARK e rodar `npm run sync`.
export const MIN_MARK = 'H';
export const API_GRAPHQL = 'https://api.tcgdex.net/v2/graphql';
export const API_REST = 'https://api.tcgdex.net/v2/en';

export function isLegalMark(mark) {
  if (!mark) return false;
  const m = mark.toUpperCase();
  return /^[A-Z]$/.test(m) && m >= MIN_MARK;
}
