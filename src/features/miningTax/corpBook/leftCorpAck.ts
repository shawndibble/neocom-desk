import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/db';

/**
 * "Stop showing {corp}" for a corporation the member has left: kept on this device so the Tax tab
 * stops listing its book. Nothing is deleted or settled; "Show" brings it back.
 */
const KEY = 'corpLeftHidden';

export async function readHiddenLeftCorps(): Promise<Set<number>> {
  try {
    const raw = (await db.settings.get(KEY))?.value;
    return new Set(
      Array.isArray(raw)
        ? raw.filter((x): x is number => Number.isInteger(x) && (x as number) > 0)
        : []
    );
  } catch {
    return new Set();
  }
}

export async function hideLeftCorp(corporationId: number): Promise<void> {
  const held = await readHiddenLeftCorps();
  held.add(corporationId);
  await db.settings.put({ key: KEY, value: [...held] });
}

export async function showLeftCorp(corporationId: number): Promise<void> {
  const held = await readHiddenLeftCorps();
  held.delete(corporationId);
  await db.settings.put({ key: KEY, value: [...held] });
}

/** The hidden set, and the two ways to change it; a failed write leaves the page as it was. */
export function useHiddenLeftCorps() {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void readHiddenLeftCorps().then((held) => !cancelled && setHidden(held));
    return () => {
      cancelled = true;
    };
  }, []);
  const hide = useCallback(
    (id: number) =>
      void hideLeftCorp(id)
        .then(() => setHidden((held) => new Set(held).add(id)))
        .catch(() => {}),
    []
  );
  const show = useCallback(
    (id: number) =>
      void showLeftCorp(id)
        .then(() =>
          setHidden((held) => {
            const next = new Set(held);
            next.delete(id);
            return next;
          })
        )
        .catch(() => {}),
    []
  );
  return useMemo(() => ({ hidden, hide, show }), [hidden, hide, show]);
}
