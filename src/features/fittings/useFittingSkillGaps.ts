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
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
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
        const byType = new Map<number, readonly RequiredSkill[]>();
        const [profile] = await Promise.all([
          loadActivePilotProfile(characterId),
          // Bounded, not `Promise.all(typeIds.map(...))`: each type's
          // requirements are their own uncached ESI round trip, and an open
          // Fitting can carry a dozen distinct types — ESI has no batch
          // endpoint for dogma attributes (Sentry: "N+1 API Call" on
          // /fittings/edit), so the fan-out is unavoidable, but it must not
          // exceed the same per-call-site cap every other ESI fan-out in the
          // app respects.
          mapWithConcurrencyLimit(typeIds, ESI_FANOUT_CONCURRENCY, async (typeId) => {
            byType.set(typeId, await loadRequirements(typeId));
          }),
        ]);
        if (cancelled) return;
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
