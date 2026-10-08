import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, RowCaret, SlideOver, Spinner, TypeIcon } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { findShips, sortShipsByJumps, type OwnedAsset, type ShipRow } from '@/engine/myShips';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import { loadOtherCharactersAssets } from './assets';
import { loadCharacterSolarSystemId } from './location';
import { loadStationName, loadStationSystemId } from './stations';
import { loadStructureName, loadStructureSystemId } from './structures';
import { loadSystemName, loadSystemSecurity } from './systemSecurity';
import { loadGroupNames } from '@/features/market/groupNames';
import { JumpsAwayText, SecurityValue } from './assetBrowserRows';
import { jumpsBetween, type JumpBasis } from '@/features/route/jumpBasis';

/** SDE category 6. */
const SHIP_CATEGORY_ID = 6;

interface ShipData {
  rows: ShipRow[];
  typeNames: ReadonlyMap<number, string>;
  /** SDE group (the ship class) by type id. */
  groupIdByType: ReadonlyMap<number, number>;
  characterNames: ReadonlyMap<number, string>;
  /** Type names of the owned assets a ship sits in, by item id (for the trail). */
  holderNames: ReadonlyMap<number, string>;
}

type ShipsState = { status: 'loading' } | { status: 'ready'; data: ShipData } | { status: 'error' };

/** SDE-backed ship lookup plus every chosen Character's ships. Cache-or-live, like the page's own cross-character read. */
async function loadShipData(characterIds: readonly number[]): Promise<ShipData> {
  const [entries, types, groupCategories] = await Promise.all([
    loadOtherCharactersAssets(characterIds),
    loadTypes(),
    // Without it no type reads as a ship: an empty list beats a wrong one.
    loadGroupCategories().catch(() => ({}) as Record<string, number>),
  ]);
  const isShip = (typeId: number) => {
    const groupId = types[String(typeId)]?.groupID;
    return groupId !== undefined && groupCategories[String(groupId)] === SHIP_CATEGORY_ID;
  };
  const owned: OwnedAsset[] = entries.flatMap((entry) =>
    entry.assets.map((asset) => ({ ...asset, characterId: entry.characterId }))
  );
  const rows = findShips(owned, isShip);
  const typeNames = new Map<number, string>();
  const groupIdByType = new Map<number, number>();
  for (const typeId of new Set(rows.map((r) => r.typeId))) {
    const type = types[String(typeId)];
    if (type?.name) typeNames.set(typeId, type.name);
    if (type) groupIdByType.set(typeId, type.groupID);
  }
  const trailIds = new Set(rows.flatMap((r) => r.trail));
  const holderNames = new Map<number, string>();
  for (const asset of owned) {
    const name = trailIds.has(asset.item_id) ? types[String(asset.type_id)]?.name : undefined;
    if (name) holderNames.set(asset.item_id, name);
  }
  return {
    rows,
    typeNames,
    groupIdByType,
    characterNames: new Map(entries.map((e) => [e.characterId, e.name])),
    holderNames,
  };
}

interface ResolvedPlace {
  name: string | null;
  systemId: number | null;
}

async function resolvePlace(row: ShipRow): Promise<ResolvedPlace> {
  const { locationId, locationType, characterId } = row;
  if (locationType === 'station') {
    return {
      name: await loadStationName(locationId),
      systemId: await loadStationSystemId(locationId),
    };
  }
  if (locationType === 'solar_system') {
    return { name: await loadSystemName(locationId), systemId: locationId };
  }
  // A structure: `other`, or the parent of an item ESI never returned as an asset.
  return {
    name: await loadStructureName(characterId, locationId),
    systemId: await loadStructureSystemId(characterId, locationId),
  };
}

interface Places {
  names: ReadonlyMap<string, string | null>;
  security: ReadonlyMap<number, number | null>;
  jumps: ReadonlyMap<string, JumpsAwayResult>;
}

const NO_PLACES: Places = { names: new Map(), security: new Map(), jumps: new Map() };

const placeKey = (row: Pick<ShipRow, 'characterId' | 'locationId'>) =>
  `${row.characterId}:${row.locationId}`;

/**
 * Names, security and jumps for every distinct place the ships sit in. Best
 * effort: each lands as it resolves and the list never waits on them.
 */
function usePlaces(
  rows: readonly ShipRow[],
  activeCharacterId: number | null,
  route: JumpBasis
): { places: Places; systemOf: ReadonlyMap<string, number | null>; originName: string | null } {
  const [places, setPlaces] = useState<Places>(NO_PLACES);
  const [originName, setOriginName] = useState<string | null>(null);
  const [systemOf, setSystemOf] = useState<ReadonlyMap<string, number | null>>(new Map());
  const routeKey = route.key;
  useEffect(() => {
    if (rows.length === 0 || !route.hydrated) return;
    let cancelled = false;
    // A new basis or origin restarts the counts: no mixing old and new jumps.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPlaces(NO_PLACES);
    setSystemOf(new Map());
    setOriginName(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const distinct = [...new Map(rows.map((r) => [placeKey(r), r])).values()];
    void (async () => {
      const originSystemId =
        activeCharacterId === null
          ? null
          : await loadCharacterSolarSystemId(activeCharacterId).catch(() => null);
      if (originSystemId !== null) {
        void loadSystemName(originSystemId)
          .then((name) => {
            if (!cancelled) setOriginName(name);
          })
          .catch(() => {});
      }
      await mapWithConcurrencyLimit(distinct, ESI_FANOUT_CONCURRENCY, async (row) => {
        const key = placeKey(row);
        let place: ResolvedPlace = { name: null, systemId: null };
        let security: number | null = null;
        let jumps: JumpsAwayResult = { kind: 'unknown', reason: 'noRoute' };
        try {
          place = await resolvePlace(row);
          if (cancelled) return;
          if (place.systemId !== null) security = await loadSystemSecurity(place.systemId);
          if (originSystemId === null) jumps = { kind: 'unknown', reason: 'noLocation' };
          else if (place.systemId !== null) {
            jumps = await jumpsBetween(originSystemId, place.systemId, route);
          }
        } catch {
          // Best effort: the row keeps its fallback label and an unknown count.
        }
        if (cancelled) return;
        setSystemOf((prev) => new Map(prev).set(key, place.systemId));
        setPlaces((prev) => ({
          names: new Map(prev.names).set(key, place.name),
          security:
            place.systemId === null
              ? prev.security
              : new Map(prev.security).set(place.systemId, security),
          jumps: new Map(prev.jumps).set(key, jumps),
        }));
      });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // `route` itself changes identity with its settings; `key` names the basis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeCharacterId, routeKey, route.hydrated]);
  return { places, systemOf, originName };
}

interface MyShipsPanelProps {
  open: boolean;
  onClose: () => void;
  /** The Character filter, already resolved to the Characters whose ships to list. */
  characterIds: readonly number[];
  activeCharacterId: number | null;
  /** The page's Character filter control; absent for a one-Character account. */
  filterControl?: ReactNode;
  /** Set while the filter reads "This character" and there are more Characters to show. */
  onShowAllCharacters?: () => void;
  /** Where a ship's location opens in the Assets browser. */
  hrefFor: (locationId: number) => string;
  route: JumpBasis;
}

/** Phone: a wrapping card (ship line, then character, place, Sec, Jumps). `sm` up: the table grid. */
const ROW_GRID =
  'flex flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.8fr)_2.5rem_4.5rem_1rem] sm:gap-y-0.5';

/** Ship classes (SDE groups) by group id; lands after the list, which never waits on it. */
function useShipClasses(groupIds: readonly number[]): ReadonlyMap<number, string> {
  const [classes, setClasses] = useState<ReadonlyMap<number, string>>(new Map());
  const idsKey = [...new Set(groupIds)].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (idsKey === '') return;
    let cancelled = false;
    void loadGroupNames(idsKey.split(',').map(Number))
      .then((names) => {
        if (!cancelled) setClasses(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idsKey]);
  return classes;
}

/**
 * My ships (issue #2853): every ship the chosen Characters own, nearest
 * first. Opened from the Assets page's Tools menu, backed by `?view=ships`.
 */
export function MyShipsPanel({
  open,
  onClose,
  characterIds,
  activeCharacterId,
  filterControl,
  onShowAllCharacters,
  hrefFor,
  route,
}: MyShipsPanelProps) {
  const { t } = useTranslation();
  const idsKey = [...characterIds].sort((a, b) => a - b).join(',');
  const [state, setState] = useState<ShipsState>({ status: 'loading' });
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new filter restarts the read
    setState({ status: 'loading' });
    void loadShipData(idsKey === '' ? [] : idsKey.split(',').map(Number)).then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data });
      },
      () => {
        if (!cancelled) setState({ status: 'error' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, idsKey]);

  const rows = useMemo(() => (state.status === 'ready' ? state.data.rows : []), [state]);
  const { places, systemOf, originName } = usePlaces(open ? rows : [], activeCharacterId, route);
  const groupIds = useMemo(
    () =>
      state.status === 'ready'
        ? rows.flatMap((r) => {
            const groupId = state.data.groupIdByType.get(r.typeId);
            return groupId === undefined ? [] : [groupId];
          })
        : [],
    [state, rows]
  );
  const shipClasses = useShipClasses(open ? groupIds : []);
  const sorted = useMemo(
    () =>
      sortShipsByJumps(rows, (row) => {
        const result = places.jumps.get(placeKey(row));
        return result?.kind === 'known' ? result.jumps : null;
      }),
    [rows, places.jumps]
  );

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={t('assets.myShips.title')}
      closeOnBack={false}
      wide
    >
      <div className="flex flex-col gap-3 p-3">
        {filterControl && <div className="flex items-center gap-2">{filterControl}</div>}
        {state.status === 'loading' && (
          <div className="flex justify-center py-10">
            <Spinner size="md" label={t('assets.myShips.loading')} />
          </div>
        )}
        {state.status === 'error' && <EmptyState title={t('assets.myShips.error')} />}
        {state.status === 'ready' && sorted.length === 0 && (
          <EmptyState
            title={t('assets.myShips.emptyTitle')}
            hint={t('assets.myShips.emptyHint')}
            action={
              onShowAllCharacters && (
                <Button size="sm" onClick={onShowAllCharacters}>
                  {t('assets.myShips.showAllCharacters')}
                </Button>
              )
            }
          />
        )}
        {state.status === 'ready' && sorted.length > 0 && (
          <div role="table" aria-label={t('assets.myShips.title')}>
            <div className="flex flex-col gap-0.5 px-3 pb-2 text-xs text-text-dim">
              <span>
                {t('assets.myShips.summary', {
                  ships: t('assets.myShips.shipCount', { count: sorted.length }),
                  characters: t('assets.myShips.characterCount', {
                    count: new Set(sorted.map((r) => r.characterId)).size,
                  }),
                })}
              </span>
              {originName && <span>{t('assets.myShips.jumpsFrom', { system: originName })}</span>}
            </div>
            <div
              role="row"
              className={`${ROW_GRID} border-b border-line px-3 py-1 text-[0.6875rem] tracking-widest text-text-dim uppercase max-sm:hidden`}
            >
              <span role="columnheader">{t('assets.myShips.columns.ship')}</span>
              <span role="columnheader">{t('assets.myShips.columns.character')}</span>
              <span role="columnheader">{t('assets.myShips.columns.location')}</span>
              <span role="columnheader">{t('assets.myShips.columns.security')}</span>
              <span role="columnheader">{t('assets.myShips.columns.jumps')}</span>
              <span />
            </div>
            {sorted.map((row) => {
              const key = placeKey(row);
              const systemId = systemOf.get(key);
              const name =
                places.names.get(key) ??
                (row.locationType === 'station'
                  ? t('assets.stationLabel', { id: row.locationId })
                  : t('assets.structureLabel', { id: row.locationId }));
              const jumps = places.jumps.get(key);
              const shipClass = shipClasses.get(state.data.groupIdByType.get(row.typeId) ?? -1);
              const trail = row.trail
                .map((itemId) => state.data.holderNames.get(itemId))
                .filter(Boolean)
                .join(' › ');
              return (
                <Link
                  key={row.itemId}
                  role="row"
                  to={hrefFor(row.locationId)}
                  className={`${ROW_GRID} group relative border-b border-line px-3 py-2 hover:bg-panel-2 ${tappableRowClassName}`}
                >
                  <span
                    role="cell"
                    className="flex min-w-0 items-center gap-2 max-sm:basis-full max-sm:pr-6"
                  >
                    <TypeIcon typeId={row.typeId} size={32} width={24} height={24} />
                    <span className="min-w-0 break-words">
                      <span className="font-semibold text-accent">
                        {state.data.typeNames.get(row.typeId) ??
                          t('assets.myShips.unknownType', { id: row.typeId })}
                      </span>
                      {shipClass && (
                        <span className="text-xs text-text-dim max-sm:ml-2 sm:block">
                          {shipClass}
                        </span>
                      )}
                    </span>
                    {row.inCargo && (
                      <span className="shrink-0 rounded-xs border border-line px-1 text-[0.6875rem] text-text-dim">
                        {t('assets.myShips.inCargo')}
                      </span>
                    )}
                  </span>
                  <span role="cell" className="min-w-0 text-xs break-words text-text-dim">
                    {state.data.characterNames.get(row.characterId)}
                  </span>
                  <span
                    role="cell"
                    className="min-w-0 text-xs break-words max-sm:grow max-sm:basis-40"
                  >
                    {name}
                    {trail && <span className="text-text-dim"> · {trail}</span>}
                  </span>
                  <span role="cell" className="text-xs">
                    <SecurityValue
                      security={typeof systemId === 'number' ? places.security.get(systemId) : null}
                    />
                  </span>
                  <span role="cell" className="text-xs whitespace-nowrap">
                    {jumps?.kind === 'known' && jumps.jumps === 0 ? (
                      <span>{t('assets.myShips.here')}</span>
                    ) : (
                      <JumpsAwayText result={jumps} t={t} />
                    )}
                  </span>
                  <span className="flex max-sm:absolute max-sm:top-3 max-sm:right-3">
                    <RowCaret />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </SlideOver>
  );
}
