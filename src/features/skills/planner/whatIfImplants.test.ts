import { describe, it, expect } from 'vitest';
import { whatIfImplants } from './whatIfImplants';

describe('whatIfImplants', () => {
  it('"none" drops every implant bonus', () => {
    expect(whatIfImplants('none', { memory: 5, perception: 3 })).toEqual({});
  });

  it('"current" passes the clone\'s real implants through unchanged', () => {
    const current = { memory: 5, perception: 3 };
    expect(whatIfImplants('current', current)).toBe(current);
  });

  it('"+N" returns a uniform bonus across all 5 attributes, ignoring current implants', () => {
    expect(whatIfImplants('+3', { memory: 5 })).toEqual({
      intelligence: 3,
      memory: 3,
      perception: 3,
      willpower: 3,
      charisma: 3,
    });
  });

  it('"+5" is the max uniform tier', () => {
    expect(whatIfImplants('+5', {})).toEqual({
      intelligence: 5,
      memory: 5,
      perception: 5,
      willpower: 5,
      charisma: 5,
    });
  });
});
