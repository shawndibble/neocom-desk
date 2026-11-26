import { useEffect, useRef, type RefObject } from 'react';
import type { BuildPlanRecord } from '@/db';
import { resolveRigFit } from '@/engine/industry/types';
import type { BuildPlanChange } from './buildPlanStore';
import { hydrateActivityFacilityDefaults } from './facilityDefaults';
import { facilityMemoryKey, patchFromMemory, recallFacility } from './facilityMemory';

export function useFacilityMemoryRecall(
  plan: BuildPlanRecord,
  costIndexMissing: boolean,
  latestPlan: RefObject<BuildPlanRecord>,
  latestOnChange: RefObject<(change: BuildPlanChange) => void>
) {
  useEffect(() => {
    void hydrateActivityFacilityDefaults();
  }, []);

  const memoryKey = facilityMemoryKey(plan);
  const recalledFor = useRef<{ rigs: string | null; index: string | null }>({
    rigs: null,
    index: null,
  });
  useEffect(() => {
    if (memoryKey === null) return;
    const wantRigs = recalledFor.current.rigs !== memoryKey;
    const wantIndex = costIndexMissing && recalledFor.current.index !== memoryKey;
    if (!wantRigs && !wantIndex) return;
    if (wantRigs) recalledFor.current.rigs = memoryKey;
    if (wantIndex) recalledFor.current.index = memoryKey;
    void recallFacility(latestPlan.current).then((memory) => {
      const current = latestPlan.current;
      if (!memory || facilityMemoryKey(current) !== memoryKey) return;
      const patch = patchFromMemory(memory, current.facility);
      const bare = resolveRigFit(current).every((kind) => kind === 'none');
      if (!wantRigs || !bare) {
        delete patch.rigFit;
        delete patch.facilityTaxPct;
      }
      if (!wantIndex || current.costIndexOverridePct !== undefined) {
        delete patch.costIndexOverridePct;
      }
      if (Object.keys(patch).length > 0) latestOnChange.current({ kind: 'edit', patch });
    });
  }, [costIndexMissing, memoryKey, latestPlan, latestOnChange]);
}
