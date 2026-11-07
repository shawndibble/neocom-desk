/**
 * The Fittings the library offers — the active Character's saved ones (My
 * Fittings, Dexie), their In-game ones (ESI), their Active Fit (the ship they
 * fly, read off their assets) and the ones shared into their Communities —
 * read once here so the tabbed panels and the Start screen's single
 * searchable list show the same rows.
 */
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
import { uidForCharacter } from '@/sync/uid';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import type { MyFittingRow } from '@/engine/fittings/myFittings';
import type { CachedResult } from '@/esi/cache';
import type { CharacterFitting } from '@/esi/endpoints';
import { loadTypes } from '@/sde/loadSde';
import { loadInGameFittings } from './inGameFittings';
import { activeShipItems, isCapsuleGroup } from '@/engine/fittings/activeShip';
import type { Fitting } from '@/engine/fittings/types';
import { loadCharacterShip } from '@/features/character/ship';
import { loadCharacterAssets } from '@/features/assets/assets';
import { shipItemsToFitting } from './assetShipLocation';

/** A saved or In-game Fitting as one row of the Start screen's list. */
export type LibraryRow = MyFittingRow &
  (
    | { source: 'saved'; record: FittingRecord }
    | { source: 'inGame'; inGame: CharacterFitting }
    /** The ship the Character is flying; its modules lag the game by up to an hour. */
    | { source: 'active'; fitting: Fitting }
    | {
        source: 'shared';
        shared: SharedFittingRow;
        /** Who shared it (their Character's name), or null when no longer a Member. */
        sharer: string | null;
        communityNames: string[];
      }
  );

/** A saved Fitting's row, for callers that only list those. */
export type SavedRow = Extract<LibraryRow, { source: 'saved' }>;

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
            ? typeNameOr(t, types[String(decoded.value.hullTypeId)]?.name, decoded.value.hullTypeId)
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
  const records = useSavedFittingRecords(characterId);
  const hulls = useHullNames(records);
  return { records, hulls };
}

/** Saved Fittings as list rows; one whose hull is still decoding is left out rather than flashed under "Unknown hull". */
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

/** The Character's In-game Fittings: fetch, grant, refresh. Nothing loads until the endpoint is granted. */
export function useInGameFittings(characterId: number | null) {
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

/** The Communities a Character is in and the Fittings shared into them (issue #3605). Nothing loads without sync. */
export function useCommunityFittings(characterId: number | null) {
  const [state, setState] = useState<{
    forCharacter: number;
    communities: CommunitySummary[];
    fittings: SharedFitting[];
    sharerNames: ReadonlyMap<string, string>;
  } | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (characterId === null || !isSyncConfigured()) {
      setState(null);
      return;
    }
    try {
      const { loadSharedFittings } = await import('@/features/communities/sharedFittings');
      const loaded = await loadSharedFittings(characterId);
      if (requestId === requestIdRef.current) setState({ forCharacter: characterId, ...loaded });
    } catch {
      // Offline or signed out of sync: the library just lists its own Fittings.
      if (requestId === requestIdRef.current) setState(null);
    }
  }, [characterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a Character switch re-reads Communities, not a render-time derivation
    void refresh();
  }, [refresh]);

  const uid = characterId === null ? null : uidForCharacter(characterId);
  // A previous Character's load is not this one's until its own lands.
  const current = state?.forCharacter === characterId ? state : null;
  const rows = useMemo(
    () =>
      current && uid !== null
        ? sharedRows(current.fittings, uid, current.communities, current.sharerNames)
        : [],
    [current, uid]
  );
  /** `shareMarker`s of the Fittings this Character already shared. */
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
  return { communities: current?.communities ?? [], rows, mine, refresh };
}

/** Shared Fittings as list rows: not the viewer's own, one row per Fitting. */
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

/** The Active Fit's row, alone (never grouped by hull: it leads the list). */
export type ActiveRow = Extract<LibraryRow, { source: 'active' }>;

/**
 * The Character's Active Fit: the flown ship (`getCharacterShip`) with the
 * assets inside it (`getCharacterAssets`). Null without both grants, in a pod,
 * or when either read fails; nothing asks for a grant, the list just lacks the row.
 */
export function useActiveFitting(characterId: number | null) {
  const { t } = useTranslation();
  const granted = useEndpointsGranted(['getCharacterShip', 'getCharacterAssets']);
  const [state, setState] = useState<{ forCharacter: number; row: ActiveRow | null } | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (characterId === null || granted !== true) {
      // A dropped grant takes the row with it.
      setState(null);
      return;
    }
    let row: ActiveRow | null = null;
    try {
      const [ship, types] = await Promise.all([loadCharacterShip(characterId), loadTypes()]);
      const hull = ship ? types[String(ship.ship_type_id)] : undefined;
      const assets =
        ship && !isCapsuleGroup(hull?.groupID) ? await loadCharacterAssets(characterId) : null;
      // An unread asset list is not an empty ship: no row rather than a bare hull.
      if (ship && assets?.cached && !assets.needsReauth) {
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
    } catch {
      // Offline or a failed read: no Active Fit, the rest of the list stands.
    }
    if (requestId === requestIdRef.current) setState({ forCharacter: characterId, row });
  }, [characterId, granted, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a Character or grant change re-reads the flown ship, not a render-time derivation
    void refresh();
  }, [refresh]);

  // A previous Character's ship is not this one's until its own lands.
  const current = state?.forCharacter === characterId ? state : null;
  /** Until this Character's read lands, the list waits: the row arriving late would move the pick and every row under a tap. */
  const pending =
    characterId !== null && (granted === undefined || (granted === true && current === null));
  return { row: current?.row ?? null, pending, refresh };
}
