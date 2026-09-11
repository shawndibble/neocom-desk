import { describe, it, expect } from 'vitest';
import { classifySpace, isWormholeSystemName, SPACE_KINDS } from './space';

describe('isWormholeSystemName', () => {
  it('matches the J###### wormhole naming pattern', () => {
    expect(isWormholeSystemName('J105443')).toBe(true);
    expect(isWormholeSystemName('j123456')).toBe(true);
  });

  it('rejects ordinary system names, even ones starting with J', () => {
    expect(isWormholeSystemName('Jita')).toBe(false);
    expect(isWormholeSystemName('Josameto')).toBe(false);
  });

  it('rejects a J-prefixed id with the wrong digit count', () => {
    expect(isWormholeSystemName('J12345')).toBe(false);
    expect(isWormholeSystemName('J1234567')).toBe(false);
  });
});

describe('classifySpace', () => {
  it('classifies a J-named system as wormhole regardless of its security status', () => {
    expect(classifySpace('J105443', -0.99)).toBe('wormhole');
    // Some wormhole systems carry a nominally "highsec" security status —
    // the name pattern must win, since `securityBand` folds it into nullsec
    // for its own two callers, not this one.
    expect(classifySpace('J105443', 0.8)).toBe('wormhole');
  });

  it('falls back to the security band for a non-wormhole system', () => {
    expect(classifySpace('Jita', 0.9)).toBe('highsec');
    expect(classifySpace('Rens', 0.3)).toBe('lowsec');
    expect(classifySpace('Nourvukaiken', -0.2)).toBe('nullsec');
  });
});

describe('SPACE_KINDS', () => {
  it('lists all four kinds, highsec to wormhole', () => {
    expect(SPACE_KINDS).toEqual(['highsec', 'lowsec', 'nullsec', 'wormhole']);
  });
});
