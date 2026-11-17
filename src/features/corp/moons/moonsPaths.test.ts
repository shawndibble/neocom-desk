import { describe, expect, it } from 'vitest';
import {
  legacyMoonsLocation,
  moonOwnerRefineryPath,
  moonsDetail,
  sharingMoonPath,
} from './moonsPaths';

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

describe('a refinery page', () => {
  it('lives below its moon owner and reads back', () => {
    const path = moonOwnerRefineryPath(98, 1001);
    expect(path).toBe('/corp/moons/moon-owners/98/refineries/1001');
    expect(moonsDetail(path)).toEqual({ kind: 'refinery', id: '98', structureId: 1001 });
    expect(moonsDetail(`${path}/`)).toMatchObject({ kind: 'refinery' });
  });

  it('leaves the moon owner page and a bad refinery id alone', () => {
    expect(moonsDetail('/corp/moons/moon-owners/98')).toEqual({ kind: 'moonOwner', id: '98' });
    expect(moonsDetail('/corp/moons/moon-owners/98/refineries/x')).toBeNull();
  });
});
