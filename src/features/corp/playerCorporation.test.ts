import { describe, expect, it } from 'vitest';
import { isPlayerCorporation } from './playerCorporation';

describe('isPlayerCorporation', () => {
  it('is false for an NPC corporation, which has no player officers', () => {
    expect(isPlayerCorporation(1000125)).toBe(false);
    expect(isPlayerCorporation(98000001)).toBe(true);
  });
});
