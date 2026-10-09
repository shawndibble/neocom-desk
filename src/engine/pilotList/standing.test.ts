import { describe, expect, it } from 'vitest';
import { resolveStanding, standingBand } from './standing';

describe('standingBand', () => {
  it.each([
    [-10, 'red'],
    [-5, 'orange'],
    [0, 'neutral'],
    [5, 'blue'],
    [10, 'blue'],
  ] as const)('puts %d in %s', (value, band) => {
    expect(standingBand(value)).toBe(band);
  });

  it('bands in-between values by the nearest ESI step', () => {
    expect(standingBand(-7.4)).toBe('orange');
    expect(standingBand(-7.5)).toBe('red');
    expect(standingBand(-0.1)).toBe('orange');
    expect(standingBand(2.4)).toBe('neutral');
    expect(standingBand(2.5)).toBe('blue');
  });
});

describe('resolveStanding', () => {
  const ids = { characterId: 1, corporationId: 2, allianceId: 3 };

  it('is null when nobody in the chain is a contact', () => {
    expect(resolveStanding(new Map(), ids)).toBeNull();
  });

  it('prefers the pilot, then the corporation, then the alliance', () => {
    const contacts = new Map([
      [1, -10],
      [2, 5],
      [3, 10],
    ]);
    expect(resolveStanding(contacts, ids)).toEqual({ band: 'red', value: -10, via: 'character' });
    contacts.delete(1);
    expect(resolveStanding(contacts, ids)).toEqual({ band: 'blue', value: 5, via: 'corporation' });
    contacts.delete(2);
    expect(resolveStanding(contacts, ids)).toEqual({ band: 'blue', value: 10, via: 'alliance' });
  });

  it('keeps a neutral contact distinct from no contact', () => {
    expect(resolveStanding(new Map([[2, 0]]), ids)).toEqual({
      band: 'neutral',
      value: 0,
      via: 'corporation',
    });
  });

  it('ignores a missing alliance or corporation', () => {
    expect(
      resolveStanding(new Map([[3, -5]]), { characterId: 1, corporationId: null, allianceId: null })
    ).toBeNull();
  });
});
