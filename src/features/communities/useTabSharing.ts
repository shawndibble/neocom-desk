import { useCallback, useEffect, useState } from 'react';
import type { ContentTab } from './communityTabs';
import { loadBlueprintShare, loadFittingsAll } from './shareSelection';
import {
  blueprintSharing,
  fittingSharing,
  planSharing,
  type BlueprintSharing,
  type TabSharing,
} from './sharingSummary';

/**
 * Each content tab's sharing line. The blueprint choice and the Fittings
 * switch are read on this device; the Fittings and Skill plans counts come
 * from the tab's own list through `onFittingsMine` / `onPlansMine`, so the
 * line costs no read that leaves the device. `refreshKey` rereads the local
 * part (bumped as My sharing closes).
 */
export function useTabSharing(characterId: number, communityId: string, refreshKey: number) {
  const [blueprints, setBlueprints] = useState<BlueprintSharing | null>(null);
  const [fittingsAll, setFittingsAll] = useState(false);
  const [mine, setMine] = useState<Record<'fittings' | 'plans', number | null>>({
    fittings: null,
    plans: null,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadBlueprintShare(characterId, communityId),
      loadFittingsAll(characterId, communityId),
    ]).then(
      ([share, all]) => {
        if (cancelled) return;
        setBlueprints(blueprintSharing(share));
        setFittingsAll(all !== null);
      },
      // The line then holds My sharing alone, as it does while loading.
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, refreshKey]);

  const onFittingsMine = useCallback(
    (count: number) => setMine((prev) => ({ ...prev, fittings: count })),
    []
  );
  const onPlansMine = useCallback(
    (count: number) => setMine((prev) => ({ ...prev, plans: count })),
    []
  );

  const fittings = fittingSharing(fittingsAll, mine.fittings);
  const plans = planSharing(mine.plans);
  const sharing: Record<ContentTab, TabSharing | null> = {
    blueprints: blueprints && { tab: 'blueprints', summary: blueprints },
    fittings: fittings && { tab: 'fittings', summary: fittings },
    plans: plans && { tab: 'plans', summary: plans },
  };
  return { sharing, onFittingsMine, onPlansMine };
}

/** Reports how many of a loaded list's items this Character shares (the tab's sharing line). */
export function useReportMineCount(
  items: readonly { ownerUid: string }[] | null,
  myUid: string,
  onMineCount: ((count: number) => void) | undefined
) {
  const count = items ? items.filter((item) => item.ownerUid === myUid).length : null;
  useEffect(() => {
    if (count !== null) onMineCount?.(count);
  }, [count, onMineCount]);
}
