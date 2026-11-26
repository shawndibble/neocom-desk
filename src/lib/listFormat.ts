import i18n from 'i18next';

export function formatList(
  items: readonly string[],
  type: 'conjunction' | 'disjunction' = 'conjunction'
): string {
  return new Intl.ListFormat(i18n.language || 'en', { style: 'long', type }).format(items);
}
