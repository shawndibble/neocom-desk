import { useCallback, useEffect, useState } from 'react';
import { fittingAlphaBlockers, type AlphaBlocker } from '@/engine/fittings/alphaClone';
import { fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import type { Fitting } from '@/engine/fittings/types';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { loadKnownRequirements } from './skillRequirements';

export interface FittingAlpha {
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
          Promise.all(typeIds.map(loadKnownRequirements)),
        ]);
        if (cancelled) return;
        setCatalog(skills);
        if (required.some((skills) => skills === null)) return;
        setResult({
          fitting,
          blockers: fittingAlphaBlockers(
            required.flatMap((skills) => skills ?? []),
            skills.engineSkills
          ),
        });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting]);

  const skillName = useCallback(
    (skillTypeId: number) => catalog?.bySkillTypeID.get(skillTypeId)?.name ?? `#${skillTypeId}`,
    [catalog]
  );
  return { blockers: result && result.fitting === fitting ? result.blockers : null, skillName };
}
