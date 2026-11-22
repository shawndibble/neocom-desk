/**
 * A typed percent: `7.5` and `7,5` both read as 7.5 (a bare `Number("7,5")` is
 * NaN, which silently disabled a Confirm). Null for blank or non-numeric text,
 * so a caller can tell "not a number" from zero. Range checks stay the caller's.
 */
export function parsePercent(text: string): number | null {
  const token = text.trim().replace(',', '.');
  if (token === '') return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}
