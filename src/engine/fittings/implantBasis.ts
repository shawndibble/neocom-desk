import type { Fitting, FittingImplantSet, PilotProfile } from './types';

export type ImplantBasis = 'clone' | 'fitting';

export function defaultImplantBasis(fitting: Fitting): ImplantBasis {
  return fitting.implantSet !== undefined ? 'fitting' : 'clone';
}

export function applyImplantBasis(
  profile: PilotProfile,
  implantSet: FittingImplantSet | undefined,
  basis: ImplantBasis
): PilotProfile {
  if (basis === 'clone') return profile;
  return {
    skillLevels: profile.skillLevels,
    implantTypeIds: implantSet?.implants ?? [],
    boosterTypeIds: implantSet?.boosters ?? [],
    ...(implantSet?.boosterSideEffects?.length
      ? { boosterSideEffects: implantSet.boosterSideEffects }
      : {}),
  };
}

export function cloneSeedSet(
  basis: ImplantBasis,
  implantSet: FittingImplantSet | undefined,
  cloneImplants: readonly number[] | undefined
): FittingImplantSet | undefined {
  return basis === 'clone' && implantSet === undefined && cloneImplants && cloneImplants.length > 0
    ? { implants: [...cloneImplants], boosters: [] }
    : undefined;
}
