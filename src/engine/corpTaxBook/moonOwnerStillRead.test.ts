import { describe, expect, it } from 'vitest';
import { isStillRead } from './moonOwners';

describe('isStillRead', () => {
  it('is every moon owner the scheduled sync still reads, one with no rate included', () => {
    for (const s of [
      'active',
      'cant-read',
      'removal-pending',
      'settled-otherwise',
      'no-rate',
    ] as const)
      expect(isStillRead(s)).toBe(true);
  });
  it('is not one that disconnected, left or was removed', () => {
    for (const s of ['disconnected', 'left', 'removed'] as const)
      expect(isStillRead(s)).toBe(false);
  });
});
