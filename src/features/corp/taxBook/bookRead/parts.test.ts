import { describe, expect, it } from 'vitest';
import { bookPartsFor } from '.';

const sorted = (tab: string, detail: Parameters<typeof bookPartsFor>[1] = null) =>
  [...bookPartsFor(tab, detail)].sort();

describe('bookPartsFor', () => {
  it('names the parts every route reads (#5717)', () => {
    // Only the Moon owners tab opens without ledger rows; every other route keeps `observed`.
    expect(sorted('overview')).toEqual(['answers', 'core', 'ledger', 'observed']);
    expect(sorted('extractions')).toEqual(['core', 'observed']);
    expect(sorted('miners')).toEqual(['answers', 'core', 'ledger', 'observed']);
    expect(sorted('late-notices')).toEqual(['core', 'ledger', 'observed']);
    expect(sorted('moon-owners')).toEqual(['core', 'owners']);
    expect(sorted('anything-else')).toEqual(['core', 'observed']);
  });

  it('reads no rows for the Moon owners tab only, and its detail page keeps them', () => {
    expect(bookPartsFor('moon-owners', null).has('observed')).toBe(false);
    expect(sorted('moon-owners', 'moonOwner')).toEqual(['core', 'observed']);
    // The whole book (the export) reads the rows, and no moon owner summary.
    expect([...bookPartsFor()].sort()).toEqual(['answers', 'core', 'ledger', 'observed']);
  });

  it('follows a detail page, not the tab it hangs under', () => {
    expect(sorted('extractions', 'miner')).toEqual(['answers', 'core', 'ledger', 'observed']);
    expect(sorted('miners', 'extraction')).toEqual(['core', 'ledger', 'observed']);
    expect(sorted('miners', 'moonOwner')).toEqual(['core', 'observed']);
  });
});
