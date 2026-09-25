/**
 * The two lists of Fittings the library offers — the active Character's saved
 * ones (My Fittings, Dexie) and their In-game ones (ESI) — read once here so
 * the tabbed panels and the Start screen's single searchable list show the
 * same rows.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FittingRecord } from '@/db';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import type { MyFittingRow } from '@/engine/fittings/myFittings';
import type { CachedResult } from '@/esi/cache';
import type { CharacterFitting } from '@/esi/endpoints';
import { loadTypes } from '@/sde/loadSde';
import { loadInGameFittings } from './inGameFittings';

/** A saved or In-game Fitting as one row of the Start screen's list. */
export type LibraryRow = MyFittingRow &
  ({ source: 'saved'; record: FittingRecord } | { source: 'inGame'; inGame: CharacterFitting });

/** Each saved code's hull name; null when the code no longer decodes. */
function useHullNames(records: readonly FittingRecord[] | undefined): Map<string, string | null> {
  const { t } = useTranslation();
  const [hulls, setHulls] = useState<Map<string, string | null>>(new Map());
  useEffect(() => {
    if (!records) return;
    let cancelled = false;
    void (async () => {
      const types = await loadTypes();
      const next = new Map<string, string | null>();
      for (const record of records) {
        const decoded = await decodeFittingShare(record.code);
        next.set(
          record.id,
          decoded.ok
            ? (types[String(decoded.value.hullTypeId)]?.name ??
                t('common.unknownType', { id: decoded.value.hullTypeId }))
            : null
        );
      }
      if (!cancelled) setHulls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [records, t]);
  return hulls;
}

/** The Character's saved Fittings and each one's hull name (absent while it decodes). */
export function useSavedFittings(characterId: number | null) {
  const records = useLiveQuery(
    () =>
      characterId === null
        ? Promise.resolve([] as FittingRecord[])
        : db.fittings.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  const hulls = useHullNames(records);
  return { records, hulls };
}

/** Saved Fittings as list rows; one whose hull is still decoding is left out rather than flashed under "Unknown hull". */
export function savedRows(
  records: readonly FittingRecord[] | undefined,
  hulls: ReadonlyMap<string, string | null>
): LibraryRow[] {
  return (records ?? [])
    .filter((record) => hulls.has(record.id))
    .map((record) => ({
      id: record.id,
      name: record.name,
      hull: hulls.get(record.id) ?? null,
      source: 'saved' as const,
      record,
    }));
}

/** The Character's In-game Fittings: fetch, grant, refresh. Nothing loads until the endpoint is granted. */
export function useInGameFittings(characterId: number) {
  const { t } = useTranslation();
  const granted = useEndpointsGranted(['getCharacterFittings']);
  const [result, setResult] = useState<CachedResult<CharacterFitting[]> | null>(null);
  const [hullNames, setHullNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Guards a Character switch mid-fetch: a stale response landing after a
  // newer request started must not overwrite what that newer request set.
  const requestIdRef = useRef(0);

  async function refresh() {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const { cached } = await loadInGameFittings(characterId);
      const types = await loadTypes();
      if (requestId !== requestIdRef.current) return;
      const names = new Map<number, string>();
      for (const fitting of cached?.data ?? []) {
        if (!names.has(fitting.ship_type_id)) {
          names.set(
            fitting.ship_type_id,
            types[String(fitting.ship_type_id)]?.name ??
              t('common.unknownType', { id: fitting.ship_type_id })
          );
        }
      }
      setResult(cached);
      setHullNames(names);
    } catch {
      if (requestId === requestIdRef.current) setError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    requestIdRef.current++;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character/grant, not a render-time derivation
    setResult(null);
    setError(false);
    if (granted === true) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh() reads characterId via closure; a Character switch is the only thing that should re-fetch.
  }, [characterId, granted]);

  return { granted, result, hullNames, loading, error, refresh };
}

/** In-game Fittings as list rows. */
export function inGameRows(
  fittings: readonly CharacterFitting[],
  hullNames: ReadonlyMap<number, string>,
  unknownHull: (typeId: number) => string
): LibraryRow[] {
  return fittings.map((fitting) => ({
    id: `game-${fitting.fitting_id}`,
    name: fitting.name,
    hull: hullNames.get(fitting.ship_type_id) ?? unknownHull(fitting.ship_type_id),
    source: 'inGame' as const,
    inGame: fitting,
  }));
}
