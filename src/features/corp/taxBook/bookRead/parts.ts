/**
 * Which parts of a Corp Tax Book a `/corp/moons` page reads (issue #5248); `slices.ts` names
 * the fields each one fills, and is the list to trust over this summary.
 * Opening a tab reads only its parts; a later tab reads the ones it adds, and
 * the parts already held are reused.
 *
 * - `core`: miners, statements, extractions, feeders (with payouts), the scheduled-sync
 *   status and the uncounted donations (#6207). Every tab joins these.
 * - `observed`: the ledger rows (a Dexie delta on a device that holds a copy, ADR 0031). Every
 *   tab reads them except Moon owners, whose figures come from the `owners` summaries (#5717);
 *   that tab asks for them only when a summary cannot stand in (`needsRowsFallback`).
 * - `ledger`: payments, dismissals, declarations, adjustments, write-offs and disputes (#6206).
 *   A Miner's Running account, a Late notice's standing and an Extraction page's per-day billing read them.
 * - `answers`: guests' answers to a hand-made grouping, shown beside a Miner.
 * - `owners`: each moon owner's server-built view summary (one doc per moon owner), which the
 *   Moon owners tab shows in place of accrual worked from every ledger row (#5717). Not in
 *   `ALL_BOOK_PARTS`: a whole-book read (the export) has no use for it.
 *
 * The settings document and `meta/paid` are not parts: every read takes them fresh.
 */
import type { BookPart } from '../bookClient';

export type { BookPart };
export const ALL_BOOK_PARTS = [
  'core',
  'observed',
  'ledger',
  'answers',
] as const satisfies readonly BookPart[];

export type BookPartSet = ReadonlySet<BookPart>;

export const ALL_BOOK_PART_SET: BookPartSet = new Set(ALL_BOOK_PARTS);

/** What a page asks for: a tab id, or a detail page below it. */
export type BookDetailKind =
  | 'extraction'
  | 'legacyMoon'
  | 'legacyRefinery'
  | 'legacyStatementPeriod'
  | 'miner'
  | 'moonOwner'
  | 'refinery';

/** The parts a page reads. No page: the whole book, as the export reads it. */
export function bookPartsFor(tab?: string, detail: BookDetailKind | null = null): BookPartSet {
  if (tab === undefined) return ALL_BOOK_PART_SET;
  const route = detail ?? tab;
  switch (route) {
    // The Running accounts read the money, dismissals and corrections: the ledger. Needs you
    // lists a declined grouping: the answers.
    case 'overview':
    case 'miner':
    case 'miners':
      return new Set<BookPart>(['core', 'observed', 'ledger', 'answers']);
    // A refinery's page reads its Extractions' moon docs, not the ledger (#6348); the retired
    // moon and refinery URLs only look up where to go.
    case 'refinery':
    case 'legacyMoon':
    case 'legacyRefinery':
    case 'legacyStatementPeriod':
    case 'statements':
      return new Set<BookPart>(['core']);
    // An Extraction's page says whether its days are billed, dismissed or in Today's mining.
    case 'moon-owners':
      return new Set<BookPart>(['core', 'owners']);
    case 'extraction':
    case 'late-notices':
      return new Set<BookPart>(['core', 'observed', 'ledger']);
    default:
      return new Set<BookPart>(['core', 'observed']);
  }
}

/** The wanted parts not yet held. */
export function missingParts(wanted: BookPartSet, held: BookPartSet): BookPartSet {
  return new Set([...wanted].filter((p) => !held.has(p)));
}

/** Whether a read holds every part a page joins: no `extendBook` read is due. */
export function holdsParts(read: { parts: BookPartSet }, wanted: BookPartSet): boolean {
  return missingParts(wanted, read.parts).size === 0;
}
