/**
 * Whether an Alpha clone can fly the open Fitting, by skill caps: the skills
 * every fitted type needs (`loadRequirements`, shared with the skill gaps),
 * checked with their prerequisites against the SDE's Alpha caps. Needs no
 * Character — it is a property of the fit, not of who flies it.
 */
import { useCallback, useEffect, useState } from 'react';
import { fittingAlphaBlockers, type AlphaBlocker } from '@/engine/fittings/alphaClone';
import { fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import type { Fitting } from '@/engine/fittings/types';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { loadRequirements } from './skillRequirements';

export interface FittingAlpha {
  /** Null while loading (or with nothing open); empty when an Alpha can fly it. */
  blockers: readonly AlphaBlocker[] | null;
  skillName: (skillTypeId: number) => string;
}

export function useFittingAlpha(fitting: Fitting | null): FittingAlpha {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [result, setResult] = useState<{ fitting: Fitting; blockers: AlphaBlocker[] } | null>(null);

  useEffect(() => {
    if (fitting === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const typeIds = fittingRequirementTypeIds(fitting);
        const [skills, required] = await Promise.all([
          loadSkillCatalog(),
          Promise.all(typeIds.map(loadRequirements)),
        ]);
        if (cancelled) return;
        setCatalog(skills);
        setResult({
          fitting,
          blockers: fittingAlphaBlockers(required.flat(), skills.engineSkills),
        });
      } catch {
        // No verdict rather than a wrong one; the chip stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting]);

  const skillName = useCallback(
    (skillTypeId: number) => catalog?.bySkillTypeID.get(skillTypeId)?.name ?? `#${skillTypeId}`,
    [catalog]
  );
  // Keyed to what was computed for, so a new Fitting never shows the last one's answer.
  return { blockers: result && result.fitting === fitting ? result.blockers : null, skillName };
}
