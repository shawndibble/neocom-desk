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

export type BookDetailKind =
  | 'extraction'
  | 'legacyMoon'
  | 'legacyRefinery'
  | 'legacyStatementPeriod'
  | 'miner'
  | 'moonOwner'
  | 'refinery';

export function bookPartsFor(tab?: string, detail: BookDetailKind | null = null): BookPartSet {
  if (tab === undefined) return ALL_BOOK_PART_SET;
  const route = detail ?? tab;
  switch (route) {
    case 'overview':
    case 'miner':
    case 'miners':
      return new Set<BookPart>(['core', 'observed', 'ledger', 'answers']);
    case 'refinery':
    case 'legacyMoon':
    case 'legacyRefinery':
    case 'legacyStatementPeriod':
    case 'statements':
      return new Set<BookPart>(['core']);
    case 'moon-owners':
      return new Set<BookPart>(['core', 'owners']);
    case 'extraction':
    case 'late-notices':
      return new Set<BookPart>(['core', 'observed', 'ledger']);
    default:
      return new Set<BookPart>(['core', 'observed']);
  }
}

export function missingParts(wanted: BookPartSet, held: BookPartSet): BookPartSet {
  return new Set([...wanted].filter((p) => !held.has(p)));
}

export function holdsParts(read: { parts: BookPartSet }, wanted: BookPartSet): boolean {
  return missingParts(wanted, read.parts).size === 0;
}
