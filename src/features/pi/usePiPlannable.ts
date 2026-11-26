import { useEffect, useState } from 'react';
import { loadPlannableTypeIds, peekPlannableTypeIds } from './products';

export function usePiPlannable(typeId: number): boolean | undefined {
  const [ids, setIds] = useState<ReadonlySet<number> | null>(peekPlannableTypeIds);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ids !== null) return;
    let cancelled = false;
    void loadPlannableTypeIds().then(
      (loaded) => {
        if (!cancelled) setIds(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (ids !== null) return ids.has(typeId);
  return failed ? false : undefined;
}
