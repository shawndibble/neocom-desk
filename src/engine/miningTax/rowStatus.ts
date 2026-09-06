export type MiningTaxRowStatus =
  'unassigned' | 'outstanding' | 'paid' | 'needs-review' | 'dismissed';

/**
 * A status's i18n key segment (`miningTax.status.<key>`), not the status
 * string itself: `'needs-review'` cannot be a JSON key path segment, and a
 * `.replace('-', '')` string-munge at each call site would silently mis-key
 * the moment a second hyphenated status is added. Plain data (no i18next
 * import — this file stays engine-pure) shared by the route and
 * `RowDetailModal.tsx` so both build the same translation key.
 *
 * Which ore an Assignment owns, and what is left unassigned, lives in
 * `ownership.ts`.
 */
export const STATUS_LABEL_KEY: Record<MiningTaxRowStatus, string> = {
  unassigned: 'unassigned',
  'needs-review': 'needsReview',
  outstanding: 'outstanding',
  paid: 'paid',
  dismissed: 'dismissed',
};
