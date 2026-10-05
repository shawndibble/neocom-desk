import { describe, expect, it } from 'vitest';
import { matchRigFits, parseReadingPct, rigReadingFor } from './rigMatch';
import type { RigFit } from './types';

const sorted = (fit: RigFit) => [...fit].sort();

describe('matchRigFits', () => {
  it('finds one ME II and one TE I rig from the rig-only numbers in highsec', () => {
    const matches = matchRigFits({
      facility: 'azbel',
      security: 'highsec',
      reading: { me: 2.4, te: 20 },
    });
    expect(matches.map((m) => sorted(m.fit))).toContainEqual(['meT2', 'none', 'teT1']);
    expect(matches.every((m) => m.basis === 'rigOnly' || m.basis === 'withHull')).toBe(true);
  });

  it('applies the security multiplier: ME I + TE II in nullsec', () => {
    const matches = matchRigFits({
      facility: 'raitaru',
      security: 'nullsec',
      reading: { me: 4.2, te: 50.4 },
    });
    expect(matches).toHaveLength(1);
    expect(sorted(matches[0].fit)).toEqual(['meT1', 'none', 'teT2']);
  });

  it('reads an empty fit as no rigs', () => {
    const matches = matchRigFits({
      facility: 'sotiyo',
      security: 'lowsec',
      reading: { me: 0, te: 0 },
    });
    expect(matches.map((m) => m.fit)).toContainEqual(['none', 'none', 'none']);
  });

  it('knows two ME rigs are not double the bonus (stacking)', () => {
    // 2.4 + 2.4 * 0.869 = 4.4856 in highsec.
    const matches = matchRigFits({
      facility: 'azbel',
      security: 'highsec',
      reading: { me: 4.49, te: 0 },
    });
    expect(matches.map((m) => sorted(m.fit))).toContainEqual(['meT2', 'meT2', 'none']);
  });

  it('can read numbers that already include the structure hull bonus', () => {
    const rigOnly = rigReadingFor(['meT2', 'teT2', 'none'], 'azbel', 'highsec');
    const matches = matchRigFits({
      facility: 'azbel',
      security: 'highsec',
      reading: { me: rigOnly.withHull.me, te: rigOnly.withHull.te },
    });
    expect(matches.map((m) => [sorted(m.fit), m.basis])).toContainEqual([
      ['meT2', 'none', 'teT2'],
      'withHull',
    ]);
  });

  it('uses the reactor multipliers for a reaction refinery', () => {
    const matches = matchRigFits({
      facility: 'tatara',
      security: 'nullsec',
      reading: { me: 2.64, te: 0 },
    });
    expect(matches.map((m) => sorted(m.fit))).toContainEqual(['meT2', 'none', 'none']);
  });

  it('returns nothing when no fit makes those numbers', () => {
    expect(
      matchRigFits({ facility: 'azbel', security: 'highsec', reading: { me: 3.33, te: 7 } })
    ).toEqual([]);
  });

  it('returns nothing for an NPC station, which has no rigs', () => {
    expect(
      matchRigFits({ facility: 'npcStation', security: 'highsec', reading: { me: 2, te: 20 } })
    ).toEqual([]);
  });

  it('lists a fit once even though slot order is arbitrary', () => {
    const matches = matchRigFits({
      facility: 'azbel',
      security: 'highsec',
      reading: { me: 2.4, te: 20 },
    });
    const keys = matches.map((m) => `${sorted(m.fit).join()}|${m.basis}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('parseReadingPct', () => {
  it('reads the ways a pilot writes a percent', () => {
    expect(parseReadingPct('2.4')).toBe(2.4);
    expect(parseReadingPct(' 2,40% ')).toBe(2.4);
    expect(parseReadingPct('0')).toBe(0);
  });

  it('rejects blanks, words and out-of-range numbers', () => {
    expect(parseReadingPct('')).toBeNull();
    expect(parseReadingPct('abc')).toBeNull();
    expect(parseReadingPct('-1')).toBeNull();
    expect(parseReadingPct('120')).toBeNull();
  });
});
