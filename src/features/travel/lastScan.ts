import { useEffect, useState } from 'react';
import { db } from '@/db';
import { sameHulls, type HullCount } from '@/engine/pilotList/dscanWorth';

/** Device-local (no `sync.` prefix), so the previous scan never reaches Firestore. */
const LAST_SCAN_KEY = 'dscan.lastScan';

export const hullsKey = (hulls: readonly HullCount[]) =>
  hulls.map((h) => `${h.typeId}x${h.count}`).join(',');

/**
 * The scan pasted before this one on this device, then stores this one in its
 * place. `undefined` while Dexie is read, `null` when there was no earlier scan,
 * and always `null` when `enabled` is false: a Shared D-Scan neither reads nor
 * overwrites this device's last scan.
 */
export function useLastScan(
  hulls: readonly HullCount[],
  enabled: boolean
): HullCount[] | null | undefined {
  const [previous, setPrevious] = useState<HullCount[] | null>();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const stored = await db.settings.get(LAST_SCAN_KEY);
      const last = Array.isArray(stored?.value) ? (stored.value as HullCount[]) : null;
      if (cancelled) return;
      setPrevious(last);
      // The same scan seen again must not wipe the scan it is compared with.
      if (last === null || !sameHulls(last, hulls)) {
        await db.settings.put({ key: LAST_SCAN_KEY, value: hulls.map((h) => ({ ...h })) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hullsKey(hulls)]);

  return enabled ? previous : null;
}
