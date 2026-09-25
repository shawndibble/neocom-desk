/**
 * The active Character's skill gaps on the open Fitting (issue #1534):
 * which modules they can't use, and the skills the "Missing N skills" chip
 * lists. Requirements come from each type's dogma attributes (the same
 * source Fit Check reads); levels are the Character's Effective Skill Levels,
 * so it follows the active Character and Alpha/Omega like the stats do.
 * `null` while loading, and with no Character (nothing to compare against).
 */
import { useEffect, useState } from 'react';
import {
  computeSkillGaps,
  fittingRequirementTypeIds,
  type SkillGaps,
} from '@/engine/fittings/skillGaps';
import type { Fitting } from '@/engine/fittings/types';
import { loadActivePilotProfile } from './fittingPilotProfile';
import { loadRequirements } from './skillRequirements';

export function useFittingSkillGaps(
  fitting: Fitting | null,
  characterId: number | null
): SkillGaps | null {
  const [result, setResult] = useState<{
    fitting: Fitting;
    characterId: number;
    gaps: SkillGaps;
  } | null>(null);

  useEffect(() => {
    if (fitting === null || characterId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const typeIds = fittingRequirementTypeIds(fitting);
        const [profile, required] = await Promise.all([
          loadActivePilotProfile(characterId),
          Promise.all(typeIds.map(loadRequirements)),
        ]);
        if (cancelled) return;
        const byType = new Map(typeIds.map((id, i) => [id, required[i]]));
        setResult({
          fitting,
          characterId,
          gaps: computeSkillGaps(fitting, byType, profile.skillLevels),
        });
      } catch {
        // Leaves the previous result's guard below to hide stale gaps.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, characterId]);

  // Keyed to what was computed for, so a switch never shows the previous
  // Character's (or Fitting's) gaps while the new ones load.
  return result && result.fitting === fitting && result.characterId === characterId
    ? result.gaps
    : null;
}
