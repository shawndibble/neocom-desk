import { decodeFittingShare, type ShareDecodeError } from '@/engine/fittings/fittingShare';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { loadTypes, loadSkills } from '@/sde/loadSde';
import { withCheckedMutations } from '@/features/abyssal/mutaplasmidData';

export type ResolveFittingShareViewResult =
  { ok: true; fitting: Fitting; profile: PilotProfile } | { ok: false; reason: ShareDecodeError };

export async function resolveFittingShareView(
  code: string
): Promise<ResolveFittingShareViewResult> {
  const decoded = await decodeFittingShare(code);
  if (!decoded.ok) return { ok: false, reason: decoded.reason };

  const [types, skills] = await Promise.all([loadTypes(), loadSkills()]);
  const name = types[String(decoded.value.hullTypeId)]?.name ?? `Type ${decoded.value.hullTypeId}`;
  const fitting = await withCheckedMutations(shareToFitting(decoded.value, name));

  const profile = buildAllVProfile(skills.map((skill) => skill.typeID));

  return { ok: true, fitting, profile };
}
