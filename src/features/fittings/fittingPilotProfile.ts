import { useCallback, useEffect, useState } from 'react';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterImplants } from '@/features/skills/data';
import { buildAllVProfile, buildPilotProfile } from '@/engine/fittings/pilotProfile';
import type { PilotProfile } from '@/engine/fittings/types';
import { loadSkills } from '@/sde/loadSde';

export async function loadActivePilotProfileState(
  characterId: number
): Promise<{ profile: PilotProfile; skillsKnown: boolean }> {
  const [corrected, implants] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadCharacterImplants(characterId),
  ]);
  return {
    profile: buildPilotProfile(corrected.effective, implants?.data ?? []),
    skillsKnown: corrected.skillsResult != null,
  };
}

export async function loadActivePilotProfile(characterId: number): Promise<PilotProfile> {
  return (await loadActivePilotProfileState(characterId)).profile;
}

export interface PilotProfileState {
  profile: PilotProfile | null;
  failed: boolean;
  skillsKnown: boolean;
  retry: () => void;
}

export function usePilotProfile(characterId: number | null): PilotProfileState {
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [skillsKnown, setSkillsKnown] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character or a retry, not a render-time derivation
    setProfile(null);
    setFailed(false);
    setSkillsKnown(true);
    void (async () => {
      try {
        const loaded =
          characterId === null
            ? {
                profile: buildAllVProfile([...(await loadSkills()).map((skill) => skill.typeID)]),
                skillsKnown: true,
              }
            : await loadActivePilotProfileState(characterId);
        if (cancelled) return;
        setProfile(loaded.profile);
        setSkillsKnown(loaded.skillsKnown);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { profile, failed, skillsKnown, retry };
}
