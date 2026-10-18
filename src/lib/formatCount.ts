import i18n from 'i18next';

/** A whole number in the active language's grouping: 12,345 in English. Rounds first; for plain counts and volumes, not ISK. */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString(i18n.language || 'en');
}
