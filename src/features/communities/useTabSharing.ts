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
