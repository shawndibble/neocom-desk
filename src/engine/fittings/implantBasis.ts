import type { Fitting, FittingImplantSet, PilotProfile } from './types';

/** "My clone" vs "Fitting's": which of the active Character's clone or the open Fitting's own carried set stats are worked out under. */
export type ImplantBasis = 'clone' | 'fitting';

/** A Fitting that carries a set opens on it — even an explicitly empty one. */
export function defaultImplantBasis(fitting: Fitting): ImplantBasis {
  return fitting.implantSet !== undefined ? 'fitting' : 'clone';
}

/**
 * `"clone"` passes `profile` straight through — see `PilotProfile`'s own doc
 * for why it never carries boosters. `"fitting"` swaps in the Fitting's own
 * carried implants/boosters (`implantSet`), or empty lists when it carries
 * none at all. Takes the set rather than the whole Fitting because an edit
 * that leaves the set alone keeps the same object, so a caller can key a
 * memo on it rather than on every edit.
 */
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
