import { describe, expect, it } from 'vitest';
import { ALL_BOOK_PARTS, bookPartsFor, mergeBookParts, missingBookParts } from './bookParts';

describe('bookPartsFor', () => {
  it('reads only the core for Extractions', () => {
    expect([...bookPartsFor('extractions', null)]).toEqual(['core']);
  });

  it('adds the moon owner summaries for the Moon owners tab only (#5717)', () => {
    expect(new Set(bookPartsFor('moon-owners', null))).toEqual(new Set(['core', 'owners']));
    // Its detail page prices one owner from the ledger rows and reads no summary.
    expect([...bookPartsFor('moon-owners', 'moonOwner')]).toEqual(['core']);
    expect(ALL_BOOK_PARTS).not.toContain('owners');
  });

  it('adds the ledger for Miners and Statements, and the answers for Miners', () => {
    expect(new Set(bookPartsFor('statements', null))).toEqual(new Set(['core', 'ledger']));
    expect(new Set(bookPartsFor('miners', null))).toEqual(new Set(['core', 'ledger', 'answers']));
  });

  it('follows a detail page, not the tab it hangs under', () => {
    expect(new Set(bookPartsFor('extractions', 'miner'))).toEqual(
      new Set(['core', 'ledger', 'answers'])
    );
    expect([...bookPartsFor('miners', 'extraction')]).toEqual(['core', 'ledger']);
    expect([...bookPartsFor('miners', 'moonOwner')]).toEqual(['core']);
  });
});

describe('missingBookParts', () => {
  it('names what a tab needs beyond what is already held', () => {
    expect([...missingBookParts(bookPartsFor('statements', null), new Set(['core']))]).toEqual([
      'ledger',
    ]);
  });

  it('is empty when the held parts cover the tab', () => {
    expect(
      missingBookParts(bookPartsFor('extractions', null), new Set(['core', 'ledger'])).size
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

describe('bookPartsFor the Overview (#5259)', () => {
  it('reads core and ledger: owed and Needs you derive from payments and declarations', () => {
    expect([...bookPartsFor('overview', null)].sort()).toEqual(['core', 'ledger']);
  });
});
