import { describe, expect, it } from 'vitest';
import {
  JUMP_RANGES,
  effectiveCurrentSystem,
  isJumpRange,
  jumpRangeSystems,
  withinJumpRange,
} from './jumpRange';

const HERE = 30000001;
const NEAR = 30000002;
const MID = 30000003;
const FAR = 30000004;

const JUMPS = new Map([
  [HERE, 0],
  [NEAR, 2],
  [MID, 5],
  [FAR, 11],
]);

describe('isJumpRange', () => {
  it('accepts every listed range and nothing else', () => {
    for (const range of JUMP_RANGES) expect(isJumpRange(range)).toBe(true);
    expect(isJumpRange('7')).toBe(false);
    expect(isJumpRange(null)).toBe(false);
  });
});

describe('jumpRangeSystems', () => {
  it('is no restriction at all for any', () => {
    expect(jumpRangeSystems(JUMPS, 'any')).toBeNull();
  });

  it('keeps only the origin for system', () => {
    expect([...(jumpRangeSystems(JUMPS, 'system') ?? [])]).toEqual([HERE]);
  });

  it('includes the boundary jump count', () => {
    expect(jumpRangeSystems(JUMPS, '5')).toEqual(new Set([HERE, NEAR, MID]));
    expect(jumpRangeSystems(JUMPS, '3')).toEqual(new Set([HERE, NEAR]));
    expect(jumpRangeSystems(JUMPS, '10')).toEqual(new Set([HERE, NEAR, MID]));
  });
});

describe('withinJumpRange', () => {
  const allowed = new Set([HERE, NEAR]);

  it('passes every row, placed or not, when unrestricted', () => {
    expect(withinJumpRange(null, null)).toBe(true);
    expect(withinJumpRange(FAR, null)).toBe(true);
  });

  it('drops a row it cannot place once a range is set', () => {
    expect(withinJumpRange(null, allowed)).toBe(false);
  });

  it('keeps only systems in range', () => {
    expect(withinJumpRange(NEAR, allowed)).toBe(true);
    expect(withinJumpRange(FAR, allowed)).toBe(false);
  });
});

describe('effectiveCurrentSystem', () => {
  it('uses the game location when nothing was picked', () => {
    expect(effectiveCurrentSystem(HERE, null)).toEqual({ systemId: HERE, source: 'game' });
  });

  it('is unknown with neither', () => {
    expect(effectiveCurrentSystem(null, null)).toEqual({ systemId: null, source: null });
  });

  it('uses the pick while the game still reports where it was made', () => {
    expect(effectiveCurrentSystem(HERE, { systemId: FAR, gameSystemId: HERE })).toEqual({
      systemId: FAR,
      source: 'picked',
    });
  });

  it('uses the pick when the game location is unreadable', () => {
    expect(effectiveCurrentSystem(null, { systemId: FAR, gameSystemId: HERE })).toEqual({
      systemId: FAR,
      source: 'picked',
    });
  });

  it('drops a stale pick once the game reports a new system', () => {
    expect(effectiveCurrentSystem(NEAR, { systemId: FAR, gameSystemId: HERE })).toEqual({
      systemId: NEAR,
      source: 'game',
    });
  });
});
