import { describe, expect, it } from 'vitest';
import {
  classifyGroup,
  groupConflicts,
  minerReaderIds,
  promoteClaims,
  type ClaimMiner,
} from './corpTaxBookClaims.js';

const set = (...n: number[]) => new Set(n);
const base = {
  mainCharacterId: 1,
  retained: set(),
  pending: set(),
  proven: set(),
  outside: set(),
  minedHere: set(1, 2, 3),
};

describe('classifyGroup', () => {
  it('keeps legacy pending guests pending, never officer claims nor readers', () => {
    const out = classifyGroup({
      ...base,
      characterIds: [1, 2, 9],
      pending: set(2, 7),
      outside: set(2, 9),
    });
    expect(out.pendingConfirmation).toEqual([2]);
    expect(out.officerClaimed).toEqual([9]);
    expect(out.readers).toEqual([1]);
  });
  it('a pending guest who is proven becomes a reader and leaves pending', () => {
    const out = classifyGroup({ ...base, characterIds: [1, 2], pending: set(2), proven: set(2) });
    expect(out.pendingConfirmation).toEqual([]);
    expect(out.readers).toEqual([1, 2]);
  });
  it('makes members who mined readers and outsiders officer claims', () => {
    const out = classifyGroup({ ...base, characterIds: [1, 2, 9], outside: set(9) });
    expect(out.officerClaimed).toEqual([9]);
    expect(out.readers).toEqual([1, 2]);
    expect(out.outsiderMain).toBe(false);
  });
  it('claims a member who never mined until they sign in', () => {
    const out = classifyGroup({ ...base, characterIds: [1, 5] });
    expect(out.officerClaimed).toEqual([5]);
  });
  it('lets a self-proven outsider read, and records the proof', () => {
    const out = classifyGroup({ ...base, characterIds: [1, 9], outside: set(9), proven: set(9) });
    expect(out.officerClaimed).toEqual([]);
    expect(out.provenCharacterIds).toEqual([9]);
    expect(out.readers).toEqual([1, 9]);
  });
  it('keeps who already read the group', () => {
    const out = classifyGroup({ ...base, characterIds: [1, 5], retained: set(5) });
    expect(out.readers).toEqual([1, 5]);
  });
  it('refuses an outsider as main when the group has a corp member', () => {
    expect(
      classifyGroup({ ...base, characterIds: [1, 9], mainCharacterId: 9, outside: set(9) })
        .outsiderMain
    ).toBe(true);
  });
  it('allows an outsider main when every character is outside', () => {
    expect(
      classifyGroup({ ...base, characterIds: [8, 9], mainCharacterId: 9, outside: set(8, 9) })
        .outsiderMain
    ).toBe(false);
  });
});

describe('minerReaderIds', () => {
  it('leaves out officer claims and legacy pending characters', () => {
    expect(
      minerReaderIds({ characterIds: [1, 2, 3], officerClaimed: [2], pendingConfirmation: [3] })
    ).toEqual([1]);
  });
});

const miner = (id: string, p: Partial<ClaimMiner>): ClaimMiner => ({
  id,
  characterIds: [],
  officerClaimed: [],
  provenCharacterIds: [],
  ...p,
});

describe('groupConflicts', () => {
  it('lists a character in two groups, earliest first, and ignores solo ids', () => {
    const out = groupConflicts(
      [
        miner('g2', { characterIds: [1, 9], createdAt: '2026-02-01' }),
        miner('g1', { characterIds: [2, 9], createdAt: '2026-01-01' }),
      ],
      'now'
    );
    expect(out).toEqual([{ characterId: 9, minerIds: ['g1', 'g2'], at: 'now' }]);
  });
  it('is empty when nobody is in two groups', () => {
    expect(
      groupConflicts([miner('a', { characterIds: [1] }), miner('b', { characterIds: [2] })], 'x')
    ).toEqual([]);
  });
});

describe('promoteClaims', () => {
  it('moves a proven claim into the proven list, and reports the new readers', () => {
    const out = promoteClaims([miner('g1', { characterIds: [1, 9], officerClaimed: [9] })], set(9));
    expect(out).toEqual([
      { minerId: 'g1', characterIds: [9], officerClaimed: [], provenCharacterIds: [9] },
    ]);
  });
  it('leaves an unproven claim, and promotes a duplicate only in the earliest group', () => {
    const out = promoteClaims(
      [
        miner('g2', { characterIds: [1, 9], officerClaimed: [9], createdAt: '2026-02-01' }),
        miner('g1', { characterIds: [2, 9], officerClaimed: [9], createdAt: '2026-01-01' }),
      ],
      set(9)
    );
    expect(out.map((o) => o.minerId)).toEqual(['g1']);
    expect(
      promoteClaims([miner('g1', { characterIds: [1, 9], officerClaimed: [9] })], set(7))
    ).toEqual([]);
  });
});
