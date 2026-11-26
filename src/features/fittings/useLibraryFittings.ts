import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { typeNameOr } from '@/lib/typeNameOr';
import type { FittingRecord } from '@/db';
import { useSavedFittingRecords } from './useSavedFittingRecords';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  dedupeSharedFittings,
  parseSharedFittingId,
  shareMarker,
  type SharedFitting,
  type SharedFittingRow,
} from '@/engine/communities/sharedFittings';
import type { CommunitySummary } from '@/features/communities/communityStore';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { uidForCharacter } from '@/sync/uid';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import type { MyFittingRow } from '@/engine/fittings/myFittings';
import type { CachedResult } from '@/esi/cache';
import type { CharacterFitting } from '@/esi/endpoints';
import { loadTypes } from '@/sde/loadSde';
import { loadInGameFittings } from './inGameFittings';
import { activeShipItems, isCapsuleGroup } from '@/engine/fittings/activeShip';
import type { Fitting } from '@/engine/fittings/types';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { loadCharacterShip } from '@/features/character/ship';
import { loadCharacterAssets } from '@/features/assets/assets';
import { shipItemsToFitting } from './assetShipLocation';

export type LibraryRow = MyFittingRow &
  (
    | { source: 'saved'; record: FittingRecord }
    | { source: 'inGame'; inGame: CharacterFitting }
    | { source: 'active'; fitting: Fitting }
    | {
        source: 'shared';
        shared: SharedFittingRow;
        sharer: string | null;
        communityNames: string[];
      }
    | { source: 'doctrine'; code: string; legacy: boolean }
  );

export type SavedRow = Extract<LibraryRow, { source: 'saved' }>;

const NO_HULLS: Map<string, string | null> = new Map();

function useHullNames(records: readonly FittingRecord[] | undefined): Map<string, string | null> {
  const { t } = useTranslation();
  const load = useCallback(async () => {
    const types = await loadTypes();
    const next = new Map<string, string | null>();
    for (const record of records ?? []) {
      const decoded = await decodeFittingShare(record.code);
      next.set(
        record.id,
        decoded.ok
          ? typeNameOr(t, types[String(decoded.value.hullTypeId)]?.name, decoded.value.hullTypeId)
          : null
      );
    }
    return next;
  }, [records, t]);
  return useKeyedLoad(records ? 'hulls' : null, load).data ?? NO_HULLS;
}

export function useSavedFittings(characterId: number | null) {
  const records = useSavedFittingRecords(characterId);
  const hulls = useHullNames(records);
  return { records, hulls };
}

export function savedRows(
  records: readonly FittingRecord[] | undefined,
  hulls: ReadonlyMap<string, string | null>
): SavedRow[] {
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

export function useInGameFittings(characterId: number | null) {
  const { t } = useTranslation();
  const granted = useEndpointsGranted(['getCharacterFittings']);
  const [result, setResult] = useState<CachedResult<CharacterFitting[]> | null>(null);
  const [hullNames, setHullNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const requestIdRef = useRef(0);

  async function refresh() {
    if (characterId === null) return;
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
            typeNameOr(t, types[String(fitting.ship_type_id)]?.name, fitting.ship_type_id)
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
    if (granted === true && characterId !== null) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh() reads characterId via closure; a Character switch is the only thing that should re-fetch.
  }, [characterId, granted]);

  return { granted, result, hullNames, loading, error, refresh };
}

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

export function useCommunityFittings(characterId: number | null) {
  const [state, setState] = useState<{
    forCharacter: number;
    communities: CommunitySummary[];
    fittings: SharedFitting[];
    sharerNames: ReadonlyMap<string, string>;
  } | null>(null);
  const requestIdRef = useRef(0);
  const [settledFor, setSettledFor] = useState<number | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (characterId === null || !isSyncConfigured()) {
      setState(null);
      if (requestId === requestIdRef.current) setSettledFor(characterId);
      return;
    }
    try {
      const { loadSharedFittings } = await import('@/features/communities/sharedFittings');
      const loaded = await loadSharedFittings(characterId);
      if (requestId === requestIdRef.current) setState({ forCharacter: characterId, ...loaded });
    } catch {
      if (requestId === requestIdRef.current) setState(null);
    }
    if (requestId === requestIdRef.current) setSettledFor(characterId);
  }, [characterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a Character switch re-reads Communities, not a render-time derivation
    void refresh();
  }, [refresh]);

  const uid = characterId === null ? null : uidForCharacter(characterId);
  const current = state?.forCharacter === characterId ? state : null;
  const rows = useMemo(
    () =>
      current && uid !== null
        ? sharedRows(current.fittings, uid, current.communities, current.sharerNames)
        : [],
    [current, uid]
  );
  const mine = useMemo(
    () =>
      new Set(
        (current?.fittings ?? [])
          .filter((fitting) => fitting.ownerUid === uid)
          .flatMap((fitting) => {
            const parsed = parseSharedFittingId(fitting.id);
            return parsed ? [shareMarker(fitting.communityId, parsed)] : [];
          })
      ),
    [current, uid]
  );
  return {
    communities: current?.communities ?? [],
    rows,
    mine,
    refresh,
    settled: settledFor === characterId,
  };
}

export function sharedRows(
  fittings: readonly SharedFitting[],
  viewerUid: string,
  communities: readonly CommunitySummary[],
  sharerNames: ReadonlyMap<string, string>
): LibraryRow[] {
  const communityName = new Map(communities.map((community) => [community.id, community.name]));
  return dedupeSharedFittings(fittings, viewerUid).map((shared) => ({
    id: `shared-${shared.id}`,
    name: shared.name,
    hull: shared.hull || null,
    source: 'shared' as const,
    shared,
    sharer: sharerNames.get(shared.ownerUid) ?? null,
    communityNames: shared.communityIds.map((id) => communityName.get(id) ?? ''),
  }));
}

export function libraryRowCode(row: LibraryRow): string | null {
  if (row.source === 'saved') return row.record.code;
  if (row.source === 'shared') return row.shared.code;
  return row.source === 'doctrine' ? row.code : null;
}

export function heldFitting(row: LibraryRow): Fitting | null {
  if (row.source === 'active') return row.fitting;
  return row.source === 'inGame' ? esiFittingToFitting(row.inGame).fitting : null;
}

export type ActiveRow = Extract<LibraryRow, { source: 'active' }>;

export function useActiveFitting(characterId: number | null) {
  const { t } = useTranslation();
  const granted = useEndpointsGranted(['getCharacterShip', 'getCharacterAssets']);
  const [state, setState] = useState<{ forCharacter: number; row: ActiveRow | null } | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (characterId === null || granted !== true) {
      setState(null);
      return;
    }
    let row: ActiveRow | null = null;
    try {
      const [ship, types, assets] = await Promise.all([
        loadCharacterShip(characterId),
        loadTypes(),
        loadCharacterAssets(characterId),
      ]);
      const hull = ship ? types[String(ship.ship_type_id)] : undefined;
      if (ship && !isCapsuleGroup(hull?.groupID) && assets.cached && !assets.needsReauth) {
        const hullName = typeNameOr(t, hull?.name, ship.ship_type_id);
        const name = ship.ship_name.trim() || hullName;
        const fitting = await shipItemsToFitting(
          { typeId: ship.ship_type_id, name },
          activeShipItems(assets.cached.data, ship.ship_item_id)
        );
        row = {
          id: `active-${ship.ship_item_id}`,
          name,
          hull: hullName,
          source: 'active',
          fitting,
        };
      }
    } catch {}
    if (requestId === requestIdRef.current) setState({ forCharacter: characterId, row });
  }, [characterId, granted, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a Character or grant change re-reads the flown ship, not a render-time derivation
    void refresh();
  }, [refresh]);

  const current = state?.forCharacter === characterId ? state : null;
  const pending =
    characterId !== null && (granted === undefined || (granted === true && current === null));
  return { row: current?.row ?? null, pending, refresh };
}
