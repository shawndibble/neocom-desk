import { describe, expect, it } from 'vitest';
import { applyImplantBasis, defaultImplantBasis } from './implantBasis';
import type { Fitting, PilotProfile } from './types';

function fitting(overrides: Partial<Fitting> = {}): Fitting {
  return {
    name: 'Rifter',
    shipTypeId: 587,
    modules: [],
    drones: [],
    cargo: [],
    ...overrides,
  };
}

const cloneProfile: PilotProfile = {
  skillLevels: new Map([[3300, 5]]),
  implantTypeIds: [19540],
  boosterTypeIds: [],
};

describe('defaultImplantBasis', () => {
  it('is "clone" when the Fitting carries no implant set', () => {
    expect(defaultImplantBasis(fitting())).toBe('clone');
  });

  it('is "fitting" when the Fitting carries a set, even an empty one', () => {
    expect(defaultImplantBasis(fitting({ implantSet: { implants: [], boosters: [] } }))).toBe(
      'fitting'
    );
  });
});

describe('applyImplantBasis', () => {
  it('returns the clone profile unchanged on "clone" basis', () => {
    expect(applyImplantBasis(cloneProfile, undefined, 'clone')).toEqual(cloneProfile);
  });

  it('swaps in the Fitting\'s carried implants and boosters on "fitting" basis', () => {
    const result = applyImplantBasis(
      cloneProfile,
      { implants: [19151], boosters: [30006] },
      'fitting'
    );
    expect(result.implantTypeIds).toEqual([19151]);
    expect(result.boosterTypeIds).toEqual([30006]);
    expect(result.skillLevels).toBe(cloneProfile.skillLevels);
  });

  it('reads as no implants/boosters on "fitting" basis when the Fitting carries no set', () => {
    const result = applyImplantBasis(cloneProfile, undefined, 'fitting');
    expect(result.implantTypeIds).toEqual([]);
    expect(result.boosterTypeIds).toEqual([]);
  });
});
