import { describe, expect, it } from 'vitest';
import { isArchivedPayee } from './archivedPayee';

const ARCHIVED = Date.UTC(2026, 10, 10, 15); // 2026-11-10

describe('isArchivedPayee', () => {
  it('is archived while nothing is owed and nothing was billed after its day', () => {
    expect(isArchivedPayee(ARCHIVED, null, [{ date: '2026-11-10' }, { date: '2026-11-01' }])).toBe(
      true
    );
  });

  it('is never archived with no archive date', () => {
    expect(isArchivedPayee(undefined, null, [])).toBe(false);
  });

  it('shows again once a day after it is billed: new money owed is never hidden', () => {
    expect(isArchivedPayee(ARCHIVED, null, [{ date: '2026-11-11' }])).toBe(false);
  });

  it('shows again when anything is owed, whatever its date', () => {
    expect(isArchivedPayee(ARCHIVED, { amount: 5 }, [])).toBe(false);
  });
});
