/**
 * Which slices of a Corp Tax Book a `/corp/moons` page reads (issue #5248).
 * Opening a tab reads only its slices; a later tab reads the ones it adds, and
 * the slices already held are reused.
 *
 * - `core`: miners, statements, extractions, observed rows, feeders (with payouts)
 *   and the scheduled-sync status. Every tab's figures, the health strip, the
 *   Activity feed and the settings dialog join these.
 * - `ledger`: payments, dismissals, declarations, adjustments and write-offs.
 *   Only a Miner's balance and a Statement's state read them.
 * - `answers`: guests' answers to a hand-made grouping, shown beside a Miner.
 *
 * The settings document and `meta/paid` are not slices: every read takes them fresh.
 */
import { CORP_BOOK_READ_MODELS } from './readModelSwitch';

export const ALL_BOOK_PARTS = ['core', 'ledger', 'answers'] as const;
export type BookPart = (typeof ALL_BOOK_PARTS)[number];

export type BookPartSet = ReadonlySet<BookPart>;

export const ALL_BOOK_PART_SET: BookPartSet = new Set(ALL_BOOK_PARTS);

/** What a page asks for: a tab id, or a detail page below it. */
export type BookDetailKind = 'extraction' | 'miner' | 'moonOwner' | 'statementPeriod';

export function bookPartsFor(
  tab: string,
  detail: BookDetailKind | null,
  readModels: boolean = CORP_BOOK_READ_MODELS
): BookPartSet {
  const route = detail ?? tab;
  switch (route) {
    // The Overview's docs stand in for the payments and declarations, but its open set
    // (unbilled days) still reads dismissals and corrections until #5260 drops the rows.
    case 'overview':
      return new Set<BookPart>(readModels ? ['core', 'ledger'] : ['core']);
    case 'miner':
    case 'miners':
      return new Set<BookPart>(['core', 'ledger', 'answers']);
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
