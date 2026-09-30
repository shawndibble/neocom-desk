import { describe, expect, it } from 'vitest';
import { parsePodKillThreshold, parseRoutePreference, parseSecurityPenalty } from './routeRules';
import { esiRoutePreference } from './esiRoute';

describe('parseRoutePreference', () => {
  it('keeps each preference the app routes by', () => {
    expect(parseRoutePreference('shortest')).toBe('shortest');
    expect(parseRoutePreference('prefer-highsec')).toBe('prefer-highsec');
    expect(parseRoutePreference('avoid-highsec')).toBe('avoid-highsec');
  });

  /*
   * The Assets page's old device-local choice is adopted as this setting's
   * first value, stored as it was — so its two words have to keep reading.
   */
  it("reads the Assets page's old 'safest' as prefer safer", () => {
    expect(parseRoutePreference('safest')).toBe('prefer-highsec');
  });

  it('rejects anything else', () => {
    expect(parseRoutePreference('secure')).toBeNull();
    expect(parseRoutePreference(3)).toBeNull();
  });
});

describe('parsePodKillThreshold', () => {
  it('keeps a whole number from 1 to 100', () => {
    expect(parsePodKillThreshold(1)).toBe(1);
    expect(parsePodKillThreshold(100)).toBe(100);
  });

  it('rejects zero, fractions and anything out of range', () => {
    expect(parsePodKillThreshold(0)).toBeNull();
    expect(parsePodKillThreshold(2.5)).toBeNull();
    expect(parsePodKillThreshold(101)).toBeNull();
    expect(parsePodKillThreshold('3')).toBeNull();
  });
});

describe('parseSecurityPenalty', () => {
  it('keeps the game slider range, 0 to 100', () => {
    expect(parseSecurityPenalty(0)).toBe(0);
    expect(parseSecurityPenalty(50)).toBe(50);
    expect(parseSecurityPenalty(100)).toBe(100);
  });

  it('rejects fractions and anything out of range', () => {
    expect(parseSecurityPenalty(-1)).toBeNull();
    expect(parseSecurityPenalty(101)).toBeNull();
    expect(parseSecurityPenalty(12.5)).toBeNull();
  });
});

describe('esiRoutePreference', () => {
  it("names each preference in ESI's own words", () => {
    expect(esiRoutePreference('shortest')).toBe('Shorter');
    expect(esiRoutePreference('prefer-highsec')).toBe('Safer');
    expect(esiRoutePreference('avoid-highsec')).toBe('LessSecure');
  });
});
