import { useEffect, useState } from 'react';
import { db } from '@/db';

const LAST_LOCAL_KEY = 'local.lastPaste';

const sameNames = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((name, i) => name === b[i]);

export function useLastLocal(names: readonly string[]): string[] | null | undefined {
  const [read, setRead] = useState<{ key: string; previous: string[] | null }>();
  const key = names.join('|');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await db.settings.get(LAST_LOCAL_KEY);
      const last = Array.isArray(stored?.value) ? (stored.value as string[]) : null;
      if (cancelled) return;
      setRead({ key, previous: last });
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
