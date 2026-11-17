import { describe, expect, it } from 'vitest';
import { legacyMoonsLocation, sharingMoonPath } from './moonsPaths';

describe('legacyMoonsLocation', () => {
  it('sends the retired Sharing tab to Moon settings on Sharing, keeping its query', () => {
    expect(legacyMoonsLocation('/corp/moons/sharing', '?highlight=7')).toEqual({
      pathname: '/corp/moons/overview',
      search: '?highlight=7&settings=sharing',
    });
    expect(legacyMoonsLocation('/corp/moons/sharing/', '')).toEqual({
      pathname: '/corp/moons/overview',
      search: '?settings=sharing',
    });
  });

  it('leaves other paths to the default-tab redirect', () => {
    expect(legacyMoonsLocation('/corp/moons', '')).toBeNull();
    expect(legacyMoonsLocation('/corp/moons/bogus', '')).toBeNull();
  });
});

describe('sharingMoonPath', () => {
  it('opens Moon settings on Sharing at a moon', () => {
    expect(sharingMoonPath(9)).toBe('/corp/moons/extractions?settings=sharing&highlight=9');
  });
});
