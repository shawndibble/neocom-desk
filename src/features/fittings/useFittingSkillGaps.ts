/**
 * The active Character's skill gaps on the open Fitting (issue #1534):
 * which modules they can't use, and the skills the "Missing N skills" chip
 * lists. Requirements come from each type's dogma attributes (the same
 * source Fit Check reads); levels are the Character's Effective Skill Levels,
 * so it follows the active Character and Alpha/Omega like the stats do.
 * `null` while loading, and with no Character (nothing to compare against).
 * `unknown` is set when some fitted type's requirements could be neither
 * read from cache nor fetched: `missing` is then only what is confirmed, and
 * an empty one must not be read as "can fly".
 */
import { useEffect, useState } from 'react';
import {
  computeSkillGaps,
  fittingRequirementTypeIds,
  type SkillGaps,
} from '@/engine/fittings/skillGaps';
import type { Fitting } from '@/engine/fittings/types';
import { useReconnectCount } from '@/stores/network';
import { loadActivePilotProfile } from './fittingPilotProfile';
import { loadRequirementsForTypes } from './skillRequirements';

export interface FittingSkillGaps extends SkillGaps {
  unknown: boolean;
}

export function useFittingSkillGaps(
  fitting: Fitting | null,
  characterId: number | null
): FittingSkillGaps | null {
  const [result, setResult] = useState<{
    fitting: Fitting;
    characterId: number;
    gaps: FittingSkillGaps;
  } | null>(null);

  // Requirements that could not be read offline are looked up again on reconnect.
  const reconnects = useReconnectCount();

  useEffect(() => {
    if (fitting === null || characterId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const typeIds = fittingRequirementTypeIds(fitting);
        // Bounded fan-out (Sentry: "N+1 API Call" on /fittings/edit): an open
        // Fitting can carry a dozen distinct types and ESI has no batch
        // endpoint for dogma attributes.
        const [profile, { byType, unknownTypeIds }] = await Promise.all([
          loadActivePilotProfile(characterId),
          loadRequirementsForTypes(typeIds),
        ]);
        if (cancelled) return;
        setResult({
          fitting,
          characterId,
          gaps: {
            ...computeSkillGaps(fitting, byType, profile.skillLevels),
            unknown: unknownTypeIds.length > 0,
          },
        });
      } catch {
        // Leaves the previous result's guard below to hide stale gaps.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, characterId, reconnects]);

  // Keyed to what was computed for, so a switch never shows the previous
  // Character's (or Fitting's) gaps while the new ones load.
  return result && result.fitting === fitting && result.characterId === characterId
    ? result.gaps
    : null;
}
