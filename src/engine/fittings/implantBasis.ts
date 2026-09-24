import type { Fitting, PilotProfile } from './types';

/**
 * "My clone" vs "Fitting's" (issue #1535, scope decision
 * `20260924-150509-fittings-section-a-fitter-after-all.md`): which of the
 * active Character's clone or the open Fitting's own carried set a Fitting's
 * stats are worked out under.
 */
export type ImplantBasis = 'clone' | 'fitting';

/** A Fitting that carries a set opens on it — even an explicitly empty one. */
export function defaultImplantBasis(fitting: Fitting): ImplantBasis {
  return fitting.implantSet !== undefined ? 'fitting' : 'clone';
}

/**
 * Resolves `basis` against `fitting` and folds the result into `profile`'s
 * implants/boosters, leaving its skills untouched. `"clone"` passes `profile`
 * straight through: it already carries the active Character's clone implants
 * (and no boosters — ESI has none to read). `"fitting"` swaps in the Fitting's
 * own carried set, or empty lists when it carries none at all.
 */
export function applyImplantBasis(
  profile: PilotProfile,
  fitting: Fitting,
  basis: ImplantBasis
): PilotProfile {
  if (basis === 'clone') return profile;
  return {
    skillLevels: profile.skillLevels,
    implantTypeIds: fitting.implantSet?.implants ?? [],
    boosterTypeIds: fitting.implantSet?.boosters ?? [],
  };
}
