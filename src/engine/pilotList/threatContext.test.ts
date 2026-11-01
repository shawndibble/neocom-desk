import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/age';
import type { KillRecord, KillSpace } from './killActivity';
import { threatInContext } from './threatContext';

const NOW = Date.UTC(2026, 10, 1);
const kill = (over: Partial<KillRecord> = {}): KillRecord => ({
  timeMs: NOW - DAY_MS,
  space: 'nullsec',
  systemId: 1,
  victimShipTypeId: 2,
  ownShipTypeId: 3,
  attackerCount: 1,
  ...over,
});
const many = (n: number, over: Partial<KillRecord> = {}) =>
  Array.from({ length: n }, () => kill(over));
const here = (space: KillSpace | null, orgMatesHere: number | null = null) => ({
  hereSpace: space,
  orgMatesHere,
});

describe('threatInContext: where you are', () => {
  it('reads a nullsec-only killer one level lower in highsec', () => {
    const read = threatInContext('active', many(6), NOW, here('highsec'));
    expect(read).toEqual({ level: 'low', base: 'active', reasons: ['elsewhere'] });
  });

  it('leaves them alone in nullsec, where they kill', () => {
    expect(threatInContext('active', many(6), NOW, here('nullsec')).level).toBe('active');
  });

  it('steps Dangerous down to Active, never further', () => {
    expect(threatInContext('dangerous', many(12), NOW, here('highsec')).level).toBe('active');
  });

  it('never reads Low lower, and never into Quiet', () => {
    expect(threatInContext('low', many(6), NOW, here('highsec')).level).toBe('low');
    expect(threatInContext('inactive', [], NOW, here('highsec')).level).toBe('inactive');
  });

  it('needs a real record: fewer than 5 placed kills prove nothing', () => {
    expect(threatInContext('active', many(4), NOW, here('highsec')).level).toBe('active');
  });

  it('counts only kills that say where, and does nothing without a known location', () => {
    expect(threatInContext('active', many(6, { space: null }), NOW, here('highsec')).level).toBe(
      'active'
    );
    expect(threatInContext('active', many(6), NOW, here(null)).level).toBe('active');
  });

  it('a single kill in the space you are in is enough to leave the level alone', () => {
    const kills = [...many(5), kill({ space: 'highsec' })];
    expect(threatInContext('active', kills, NOW, here('highsec')).level).toBe('active');
  });

  it('ignores kills older than the 90-day window', () => {
    const old = many(6, { timeMs: NOW - 100 * DAY_MS, space: 'highsec' });
    expect(threatInContext('active', [...many(6), ...old], NOW, here('highsec')).level).toBe('low');
  });
});

describe('threatInContext: groups', () => {
  const gang = (n: number) => many(n, { attackerCount: 8 });

  it('reads a group killer alone in Local one level lower', () => {
    const read = threatInContext('active', gang(6), NOW, here('nullsec', 0));
    expect(read).toEqual({ level: 'low', base: 'active', reasons: ['gangAlone'] });
  });

  it('reads a group killer with three of their own here one level higher, up to Active', () => {
    const read = threatInContext('low', gang(6), NOW, here('nullsec', 3));
    expect(read).toEqual({ level: 'active', base: 'low', reasons: ['gangHere'] });
    expect(threatInContext('dangerous', gang(12), NOW, here('nullsec', 5)).level).toBe('dangerous');
    expect(threatInContext('active', gang(6), NOW, here('nullsec', 5)).level).toBe('active');
  });

  it('does nothing with one or two of their own here, or with no Local to read', () => {
    expect(threatInContext('active', gang(6), NOW, here('nullsec', 2)).level).toBe('active');
    expect(threatInContext('active', gang(6), NOW, here('nullsec', null)).level).toBe('active');
  });

  it('does nothing to a solo killer, or when attacker counts are unknown', () => {
    expect(threatInContext('active', many(6), NOW, here('nullsec', 0)).level).toBe('active');
    const unknown = many(6, { attackerCount: undefined });
    expect(threatInContext('active', unknown, NOW, here('nullsec', 0)).level).toBe('active');
  });

  it('moves at most one level when both rules lower it, and says only that it moved', () => {
    const read = threatInContext('dangerous', gang(12), NOW, here('highsec', 0));
    expect(read.level).toBe('active');
    expect(read.reasons).toEqual(['elsewhere', 'gangAlone']);
  });

  it('cancels out when one rule lowers and the other raises, and reports nothing', () => {
    const read = threatInContext('low', gang(6), NOW, here('highsec', 4));
    expect(read).toEqual({ level: 'low', base: 'low', reasons: [] });
  });
});
