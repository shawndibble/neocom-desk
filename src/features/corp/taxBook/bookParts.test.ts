import { describe, expect, it } from 'vitest';
import { ALL_BOOK_PARTS, bookPartsFor, mergeBookParts, missingBookParts } from './bookParts';

const sorted = (tab: string, detail: Parameters<typeof bookPartsFor>[1] = null) =>
  [...bookPartsFor(tab, detail)].sort();

describe('bookPartsFor', () => {
  it('names the parts every route reads (#5717)', () => {
    // Only the Moon owners tab opens without ledger rows; every other route keeps `observed`.
    expect(sorted('overview')).toEqual(['core', 'ledger', 'observed']);
    expect(sorted('extractions')).toEqual(['core', 'observed']);
    expect(sorted('miners')).toEqual(['answers', 'core', 'ledger', 'observed']);
    expect(sorted('statements')).toEqual(['core', 'ledger', 'observed']);
    expect(sorted('moon-owners')).toEqual(['core', 'owners']);
    expect(sorted('anything-else')).toEqual(['core', 'observed']);
  });

  it('reads no rows for the Moon owners tab only, and its detail page keeps them', () => {
    expect(bookPartsFor('moon-owners', null).has('observed')).toBe(false);
    expect(sorted('moon-owners', 'moonOwner')).toEqual(['core', 'observed']);
    expect(ALL_BOOK_PARTS).toContain('observed');
    expect(ALL_BOOK_PARTS).not.toContain('owners');
  });

  it('follows a detail page, not the tab it hangs under', () => {
    expect(sorted('extractions', 'miner')).toEqual(['answers', 'core', 'ledger', 'observed']);
    expect(sorted('miners', 'extraction')).toEqual(['core', 'ledger', 'observed']);
    expect(sorted('miners', 'moonOwner')).toEqual(['core', 'observed']);
    expect(sorted('moon-owners', 'statementPeriod')).toEqual(['core', 'ledger', 'observed']);
  });
});

describe('missingBookParts', () => {
  it('names what a tab needs beyond what is already held', () => {
    expect([
      ...missingBookParts(bookPartsFor('statements', null), new Set(['core', 'observed'])),
    ]).toEqual(['ledger']);
  });

  it('reads only the rows when the Moon owners tab falls back to them', () => {
    expect([
      ...missingBookParts(
        new Set(['core', 'owners', 'observed']),
        bookPartsFor('moon-owners', null)
      ),
    ]).toEqual(['observed']);
  });

  it('is empty when the held parts cover the tab', () => {
    expect(
      missingBookParts(bookPartsFor('extractions', null), new Set(['core', 'observed', 'ledger']))
        .size
    ).toBe(0);
  });

  it('treats an unmarked book as holding everything', () => {
    expect(missingBookParts(bookPartsFor('miners', null), undefined).size).toBe(0);
  });
});

describe('mergeBookParts', () => {
  it('unions two reads', () => {
    expect(new Set(mergeBookParts(new Set(['core']), new Set(['ledger'])))).toEqual(
      new Set(['core', 'ledger'])
    );
  });

  it('keeps the everything marker', () => {
    expect(new Set(mergeBookParts(undefined, new Set(['core'])))).toEqual(new Set(ALL_BOOK_PARTS));
  });
});
