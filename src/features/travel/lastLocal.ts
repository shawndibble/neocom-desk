import { useEffect, useState } from 'react';
import { db } from '@/db';

/** Device-local (no `sync.` prefix), so the previous Local paste never reaches Firestore. */
const LAST_LOCAL_KEY = 'local.lastPaste';

const sameNames = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((name, i) => name === b[i]);

/**
 * The Local list pasted before this one on this device, then stores this one in
 * its place. `undefined` while Dexie is read, `null` when there was no earlier paste.
 */
export function useLastLocal(names: readonly string[]): string[] | null | undefined {
  // Tagged with the paste it was read for, so a new paste never reads the last one's answer.
  const [read, setRead] = useState<{ key: string; previous: string[] | null }>();
  const key = names.join('|');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await db.settings.get(LAST_LOCAL_KEY);
      const last = Array.isArray(stored?.value) ? (stored.value as string[]) : null;
      if (cancelled) return;
      setRead({ key, previous: last });
      // The same paste seen again must not wipe the paste it is compared with.
      if (last === null || !sameNames(last, names)) {
        await db.settings.put({ key: LAST_LOCAL_KEY, value: [...names] });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return read?.key === key ? read.previous : undefined;
}
