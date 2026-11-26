export function parsePercent(text: string): number | null {
  const token = text.trim().replace(',', '.');
  if (token === '') return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}
