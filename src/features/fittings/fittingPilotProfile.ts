/**
 * The active Character's own `PilotProfile` (issue #1531's shape): trained
 * skills at Effective Skill Level, plus the active clone's implants — what
 * every open Fitting's stats are worked out under, per CONTEXT.md's
 * **Fitting** entry. The logged-out Share Link view (#1544) instead uses
 * `buildAllVProfile`; this is only for the normal, Character-present route.
 */
import { useCallback, useEffect, useState } from 'react';
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

export interface PilotProfileState {
  profile: PilotProfile | null;
  /** The load threw — `profile` stays `null`, so callers can tell "gave up" from "still loading". */
  failed: boolean;
  /** Tries the load again (a passing network or SDE error shouldn't stick for the life of the page). */
  retry: () => void;
}

/**
 * The pilot a Fitting's stats and fit checks run under: the active
 * Character's own profile, or All V with no Character. Shared by the
 * single-Fitting editor and the compare page, so a load failure is reported
 * the same way on both.
 */
export function usePilotProfile(characterId: number | null): PilotProfileState {
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character or a retry, not a render-time derivation
    setProfile(null);
    setFailed(false);
    void (async () => {
      try {
        const loaded =
          characterId === null
            ? buildAllVProfile([...(await loadSkills()).map((skill) => skill.typeID)])
            : await loadActivePilotProfile(characterId);
        if (!cancelled) setProfile(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { profile, failed, retry };
}
