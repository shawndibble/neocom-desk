import { useEffect, useState } from 'react';
import { db } from '@/db';
import { sameHulls, type HullCount } from '@/engine/pilotList/dscanWorth';

const LAST_SCAN_KEY = 'dscan.lastScan';

export const hullsKey = (hulls: readonly HullCount[]) =>
  hulls.map((h) => `${h.typeId}x${h.count}`).join(',');

export function useLastScan(
  hulls: readonly HullCount[],
  enabled: boolean
): HullCount[] | null | undefined {
  const [read, setRead] = useState<{ key: string; previous: HullCount[] | null }>();
  const key = hullsKey(hulls);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const stored = await db.settings.get(LAST_SCAN_KEY);
      const last = Array.isArray(stored?.value) ? (stored.value as HullCount[]) : null;
      if (cancelled) return;
      setRead({ key, previous: last });
      if (last === null || !sameHulls(last, hulls)) {
        await db.settings.put({ key: LAST_SCAN_KEY, value: hulls.map((h) => ({ ...h })) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hullsKey(hulls)]);

  if (!enabled) return null;
  return read?.key === key ? read.previous : undefined;
}
