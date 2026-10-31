/**
 * Which slices of a Corp Tax Book a `/corp/moons` page reads (issue #5248).
 * Opening a tab reads only its slices; a later tab reads the ones it adds, and
 * the slices already held are reused.
 *
 * - `core`: miners, statements, extractions, observed rows, feeders (with payouts)
 *   and the scheduled-sync status. Every tab's figures, the health strip, the
 *   Activity feed and the settings dialog join these.
 * - `ledger`: payments, dismissals, declarations, adjustments and write-offs.
 *   A Miner's balance, a Statement's state and an Extraction page's per-day billing read them.
 * - `answers`: guests' answers to a hand-made grouping, shown beside a Miner.
 * - `owners`: each moon owner's server-built view summary (one doc per moon owner), which the
 *   Moon owners tab shows in place of accrual worked from every ledger row (#5717). Not in
 *   `ALL_BOOK_PARTS`: a whole-book read (the export) has no use for it.
 *
 * The settings document and `meta/paid` are not slices: every read takes them fresh.
 */
export const ALL_BOOK_PARTS = ['core', 'ledger', 'answers'] as const;
export type BookPart = (typeof ALL_BOOK_PARTS)[number] | 'owners';

export type BookPartSet = ReadonlySet<BookPart>;

export const ALL_BOOK_PART_SET: BookPartSet = new Set(ALL_BOOK_PARTS);

/** What a page asks for: a tab id, or a detail page below it. */
export type BookDetailKind = 'extraction' | 'miner' | 'moonOwner' | 'statementPeriod';

export function bookPartsFor(tab: string, detail: BookDetailKind | null): BookPartSet {
  const route = detail ?? tab;
  switch (route) {
    // The read models stand in for payments and declarations, but the open set (unbilled
    // days) still reads dismissals and corrections, and a book whose docs are missing falls
    // back to the whole-book view, which needs the ledger.
    case 'overview':
      return new Set<BookPart>(['core', 'ledger']);
    case 'miner':
    case 'miners':
      return new Set<BookPart>(['core', 'ledger', 'answers']);
    // An Extraction's page says whether its days are billed, dismissed or in Today's mining.
    case 'moon-owners':
      return new Set<BookPart>(['core', 'owners']);
    case 'extraction':
    case 'statements':
    case 'statementPeriod':
      return new Set<BookPart>(['core', 'ledger']);
    default:
      return new Set<BookPart>(['core']);
  }
}

/** The wanted parts not yet held. `held` undefined is a book read whole. */
export function missingBookParts(wanted: BookPartSet, held: BookPartSet | undefined): BookPartSet {
  if (held === undefined) return new Set();
  return new Set([...wanted].filter((p) => !held.has(p)));
}

/** Two reads of one book as one. `undefined` is a book read whole. */
export function mergeBookParts(
  a: BookPartSet | undefined,
  b: BookPartSet | undefined
): BookPartSet {
  if (a === undefined || b === undefined) return new Set(ALL_BOOK_PARTS);
  return new Set([...a, ...b]);
}
