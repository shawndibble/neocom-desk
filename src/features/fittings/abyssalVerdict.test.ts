import { describe, expect, it } from 'vitest';
import { abyssalVerdict } from './abyssalVerdict';

const cruiser = { eligible: true, shipClass: 'cruiser', ships: 1, confirmed: true } as const;

describe('abyssalVerdict', () => {
  it('is clear when the hull enters and nothing flags', () => {
    expect(abyssalVerdict(cruiser, 'clear', true)).toEqual({
      clear: true,
      facts: ['hull.cruiser', 'activation.clear'],
      problems: [],
    });
  });

  it('turns each cause into a problem and drops the lead', () => {
    expect(abyssalVerdict(cruiser, 'suspect', true)).toEqual({
      clear: false,
      facts: ['hull.cruiser'],
      problems: ['activation.suspect'],
    });
    expect(abyssalVerdict({ eligible: false, reason: 'tooLarge' }, 'unpoliced', true)).toEqual({
      clear: false,
      facts: [],
      problems: ['hull.tooLarge', 'activation.unpoliced'],
    });
  });

  it('flags an unconfirmed hull even when nothing else is wrong', () => {
    expect(abyssalVerdict({ ...cruiser, confirmed: false }, 'clear', true)).toEqual({
      clear: false,
      facts: ['hull.cruiser', 'activation.clear'],
      problems: ['hull.unconfirmed'],
    });
  });

  it('leaves the hull out while the catalogue has not said what it is', () => {
    expect(abyssalVerdict({ eligible: false, reason: 'unlisted' }, 'clear', false)).toEqual({
      clear: true,
      facts: ['activation.clear'],
      problems: [],
    });
  });
});
