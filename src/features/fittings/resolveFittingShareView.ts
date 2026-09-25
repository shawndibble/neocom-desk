/**
 * Resolves a Share Link code into the logged-out share view's Fitting and
 * profile (issue #1544) — decode, name the hull, then build the All-V
 * profile the scope decision requires (`buildAllVProfile`, layered with the
 * Fitting's own implant set when it carries one, same as
 * `useFittingWorkspace`'s `activeCharacterId === null` fallback does for the
 * ordinary route). Pulled out as its own pure-ish function, rather than
 * copied into the route, so it has its own unit test.
 */
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import { applyImplantBasis } from '@/engine/fittings/implantBasis';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { loadTypes, loadSkills } from '@/sde/loadSde';

/** Matches `decodeFittingShare`'s own `DecodeFittingShareResult['reason']`, which isn't exported on its own. */
export type ShareDecodeError = 'invalid' | 'unsupported-version';

export type ResolveFittingShareViewResult =
  { ok: true; fitting: Fitting; profile: PilotProfile } | { ok: false; reason: ShareDecodeError };

export async function resolveFittingShareView(
  code: string
): Promise<ResolveFittingShareViewResult> {
  const decoded = await decodeFittingShare(code);
  if (!decoded.ok) return { ok: false, reason: decoded.reason };

  const [types, skills] = await Promise.all([loadTypes(), loadSkills()]);
  const name = types[String(decoded.value.hullTypeId)]?.name ?? `Type ${decoded.value.hullTypeId}`;
  const fitting = shareToFitting(decoded.value, name);

  const allVProfile = buildAllVProfile(skills.map((skill) => skill.typeID));
  const profile = applyImplantBasis(allVProfile, fitting.implantSet, 'fitting');

  return { ok: true, fitting, profile };
}
