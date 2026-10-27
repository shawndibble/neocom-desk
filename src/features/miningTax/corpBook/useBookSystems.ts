import { useEffect, useMemo, useState } from 'react';
import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import type { CorpBookView } from './corpBookView';

interface Resolved {
  names: ReadonlyMap<number, string>;
  security: ReadonlyMap<number, number>;
}

/**
 * The system names and security of the Corp Tax Book rows, merged over the
 * ledger's own (`known`): a book row's system is looked up exactly like a
 * personal row's (`loadSystemNameAndSecurity`), only for the ids the ledger
 * has not resolved already. An id that fails to resolve stays out of the maps,
 * so the row falls back to `#id`.
 */
export function useBookSystems(
  view: CorpBookView | null,
  known: { names: ReadonlyMap<number, string>; security: ReadonlyMap<number, number> }
): Resolved {
  const [extra, setExtra] = useState<Resolved>({ names: new Map(), security: new Map() });
  const missing = useMemo(() => {
    const ids = new Set<number>();
    for (const row of view?.overlay.rows ?? []) {
      if (row.solarSystemId > 0 && !known.names.has(row.solarSystemId)) ids.add(row.solarSystemId);
    }
    return [...ids].sort((a, b) => a - b).join(',');
  }, [view, known.names]);

  useEffect(() => {
    if (missing === '') return;
    let cancelled = false;
    void Promise.all(
      missing.split(',').map(async (raw) => {
        const id = Number(raw);
        const found = await loadSystemNameAndSecurity(id).catch(() => null);
        return { id, name: found?.name ?? null, security: found?.security ?? null };
      })
    ).then((found) => {
      if (cancelled) return;
      const names = new Map<number, string>();
      const security = new Map<number, number>();
      for (const f of found) {
        if (f.name) names.set(f.id, f.name);
        if (f.security !== null) security.set(f.id, f.security);
      }
      setExtra((prev) => ({
        names: new Map([...prev.names, ...names]),
        security: new Map([...prev.security, ...security]),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [missing]);

  return useMemo(
    () => ({
      names: new Map([...extra.names, ...known.names]),
      security: new Map([...extra.security, ...known.security]),
    }),
    [extra, known.names, known.security]
  );
}
