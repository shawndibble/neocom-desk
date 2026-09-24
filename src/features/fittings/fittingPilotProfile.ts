/**
 * The active Character's own `PilotProfile` (issue #1531's shape): trained
 * skills at Effective Skill Level, plus the active clone's implants — what
 * every open Fitting's stats are worked out under, per CONTEXT.md's
 * **Fitting** entry. The logged-out Share Link view (#1544) instead uses
 * `buildAllVProfile`; this is only for the normal, Character-present route.
 */
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterImplants } from '@/features/skills/data';
import { buildPilotProfile } from '@/engine/fittings/pilotProfile';
import type { PilotProfile } from '@/engine/fittings/types';

export async function loadActivePilotProfile(characterId: number): Promise<PilotProfile> {
  const [corrected, implants] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadCharacterImplants(characterId),
  ]);
  return buildPilotProfile(corrected.effective, implants?.data ?? []);
}
