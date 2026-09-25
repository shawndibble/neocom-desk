/**
 * The active Character's own `PilotProfile` (issue #1531's shape): trained
 * skills at Effective Skill Level, plus the active clone's implants — what
 * every open Fitting's stats are worked out under, per CONTEXT.md's
 * **Fitting** entry. The logged-out Share Link view (#1544) instead uses
 * `buildAllVProfile`; this is only for the normal, Character-present route.
 */
import { useEffect, useState } from 'react';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterImplants } from '@/features/skills/data';
import { buildAllVProfile, buildPilotProfile } from '@/engine/fittings/pilotProfile';
import type { PilotProfile } from '@/engine/fittings/types';
import { loadSkills } from '@/sde/loadSde';

export async function loadActivePilotProfile(characterId: number): Promise<PilotProfile> {
  const [corrected, implants] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadCharacterImplants(characterId),
  ]);
  return buildPilotProfile(corrected.effective, implants?.data ?? []);
}

/**
 * The pilot a Fitting's stats and fit checks run under: the active
 * Character's own profile, or All V with no Character. `useFittingWorkspace`
 * has its own copy of this fallback for the single-Fitting editor.
 */
export function usePilotProfile(characterId: number | null): PilotProfile | null {
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character, not a render-time derivation
    setProfile(null);
    void (async () => {
      try {
        const loaded =
          characterId === null
            ? buildAllVProfile([...(await loadSkills()).map((skill) => skill.typeID)])
            : await loadActivePilotProfile(characterId);
        if (!cancelled) setProfile(loaded);
      } catch {
        // Left `null` on failure — no unhandled rejection, same as before.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  return profile;
}
