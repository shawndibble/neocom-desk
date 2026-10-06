import { describe, it, expect } from 'vitest';
import { pageOwnsReauth } from './pageOwnsReauth';

describe('pageOwnsReauth', () => {
  it('is true for the planets read on a PI tab', () => {
    expect(pageOwnsReauth('/planetary-industry', 'getCharacterPlanets')).toBe(true);
    expect(pageOwnsReauth('/planetary-industry/map', 'getCharacterPlanets')).toBe(true);
  });

  it('is false for the planets read elsewhere in the app', () => {
    expect(pageOwnsReauth('/mail', 'getCharacterPlanets')).toBe(false);
    expect(pageOwnsReauth('/planetary-industry-x', 'getCharacterPlanets')).toBe(false);
  });

  it('is false for other endpoints on a PI tab, which have no banner there', () => {
    expect(pageOwnsReauth('/planetary-industry/plan', 'getCharacterPlanet')).toBe(false);
    expect(pageOwnsReauth('/planetary-industry/plan', undefined)).toBe(false);
  });
});
