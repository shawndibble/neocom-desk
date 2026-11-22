import { describe, expect, it } from 'vitest';
import { isArchivedPayee } from './archivedPayee';

const ARCHIVED = Date.UTC(2026, 10, 10, 15); // 2026-11-10 15:00 UTC

describe('isArchivedPayee', () => {
  it('is archived while nothing is owed and nothing was billed or changed since', () => {
    expect(
      isArchivedPayee(ARCHIVED, null, [{ updatedAt: ARCHIVED - 1 }, { updatedAt: ARCHIVED }])
    ).toBe(true);
  });

  it('is never archived with no archive date', () => {
    expect(isArchivedPayee(undefined, null, [])).toBe(false);
  });

  it('shows again when an Assignment is billed or changed after it, whatever day it was mined', () => {
    // A backfill of an old day, or the same day it was archived, entered afterwards.
    expect(isArchivedPayee(ARCHIVED, null, [{ updatedAt: ARCHIVED + 1 }])).toBe(false);
  });

  it('shows again when anything is owed, whatever its date', () => {
    expect(isArchivedPayee(ARCHIVED, { amount: 5 }, [])).toBe(false);
  });
});
