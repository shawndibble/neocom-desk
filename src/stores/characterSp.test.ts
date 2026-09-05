import { describe, it, expect } from 'vitest';
import { getLastKnownSpSummary, rememberSpSummary, NO_SP_SUMMARY } from './characterSp';

describe('getLastKnownSpSummary / rememberSpSummary', () => {
  it('is empty for a character nothing has loaded yet', () => {
    expect(getLastKnownSpSummary(1)).toEqual(NO_SP_SUMMARY);
  });

  it('is empty when asked with no character at all', () => {
    expect(getLastKnownSpSummary(null)).toEqual(NO_SP_SUMMARY);
  });

  it('remembers a real summary so a later tab can seed from it instead of blanking', () => {
    rememberSpSummary(2, { totalSp: 5_000_000, unallocatedSp: 12_000 });

    expect(getLastKnownSpSummary(2)).toEqual({ totalSp: 5_000_000, unallocatedSp: 12_000 });
  });

  it('keeps the last good value rather than overwriting it with an all-null read', () => {
    // Simulates a tab whose own load can't reach /skills (no grant, offline,
    // whatever) mounting after another tab already found real numbers — it
    // must not blank what the previous tab already established.
    rememberSpSummary(3, { totalSp: 8_000_000, unallocatedSp: 3_000 });

    rememberSpSummary(3, NO_SP_SUMMARY);

    expect(getLastKnownSpSummary(3)).toEqual({ totalSp: 8_000_000, unallocatedSp: 3_000 });
  });

  it('remembers a summary with only one field set', () => {
    rememberSpSummary(4, { totalSp: 1_000, unallocatedSp: null });

    expect(getLastKnownSpSummary(4)).toEqual({ totalSp: 1_000, unallocatedSp: null });
  });
});
