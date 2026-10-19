import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveAffiliations = vi.fn();
vi.mock('@/features/character/affiliations', () => ({
  resolveAffiliations: (...a: unknown[]) => resolveAffiliations(...a),
}));

import { loadCurrentMemberIds } from './currentMembers';

const aff = (character_id: number, corporation_id: number) => ({ character_id, corporation_id });

beforeEach(() => resolveAffiliations.mockReset());

describe('loadCurrentMemberIds (#4194)', () => {
  it('keeps the characters whose current corporation is the book’s', async () => {
    resolveAffiliations.mockResolvedValue(
      new Map([
        [1, aff(1, 98)],
        [2, aff(2, 99)],
        [3, aff(3, 98)],
      ])
    );
    const members = await loadCurrentMemberIds([1, 2, 3], 98);
    expect([...members!].sort()).toEqual([1, 3]);
  });

  it('asks once for the distinct ids', async () => {
    resolveAffiliations.mockResolvedValue(new Map([[1, aff(1, 98)]]));
    await loadCurrentMemberIds([1, 1, 1], 98);
    expect(resolveAffiliations).toHaveBeenCalledTimes(1);
    expect(resolveAffiliations).toHaveBeenCalledWith([1]);
  });

  it('is undefined when nothing could be resolved, so standing falls back to the ledger', async () => {
    resolveAffiliations.mockResolvedValue(new Map());
    expect(await loadCurrentMemberIds([1, 2], 98)).toBeUndefined();
    expect(await loadCurrentMemberIds([], 98)).toBeUndefined();
  });

  it('does not call a character with no answer a leaver', async () => {
    resolveAffiliations.mockResolvedValue(new Map([[1, aff(1, 99)]]));
    // 2 had no answer: it is neither a member nor known to have left.
    const members = await loadCurrentMemberIds([1, 2], 98);
    expect(members).toBeDefined();
    expect(members!.has(2)).toBe(true);
    expect(members!.has(1)).toBe(false);
  });
});
