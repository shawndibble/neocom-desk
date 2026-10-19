import i18n from 'i18next';

/** "A, B, and C" in the active language. Built per call so a language switch applies. */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(i18n.language || 'en', { style: 'long', type: 'conjunction' }).format(
    items
  );
}
