import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  MenuItem,
  RowActionsMenu,
  RowMoreActions,
  SearchInput,
  Spinner,
  TypeIcon,
} from '@/components/ui';
import { useLiftAfterHoldGuard } from '@/components/ui/liftAfterHold';
import { ShowInfoMenuItem } from '@/features/market/ItemContextMenu';
import { useItemActions } from '@/features/market/itemActions';
import { shipItemsEditLocation } from '@/features/fittings/assetShipLocation';
import { routeToHref } from '@/features/travel/routeSafetyLink';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  focusRingInsetClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import type { ShipAssetItem } from '@/engine/fittings/assetShipMapper';
import { findShips, type OwnedAsset, type ShipRow } from '@/engine/myShips';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
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
  /** What sits directly in each ship (slots, bays, cargo), by ship item id: the fitting the menu opens. */
  contentsByShip: ReadonlyMap<number, ShipAssetItem[]>;
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
  const shipIds = new Set(rows.map((r) => r.itemId));
  const contentsByShip = new Map<number, ShipAssetItem[]>();
  for (const asset of owned) {
    if (asset.location_type !== 'item' || !shipIds.has(asset.location_id)) continue;
    const list = contentsByShip.get(asset.location_id) ?? [];
    list.push({
      typeId: asset.type_id,
      quantity: asset.quantity,
      flag: asset.location_flag,
    });
    contentsByShip.set(asset.location_id, list);
  }
  return {
    rows,
    typeNames,
    groupIdByType,
    characterNames: new Map(entries.map((e) => [e.characterId, e.name])),
    holderNames,
    contentsByShip,
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
): { places: Places; systemOf: ReadonlyMap<string, number | null> } {
  const [places, setPlaces] = useState<Places>(NO_PLACES);
  const [systemOf, setSystemOf] = useState<ReadonlyMap<string, number | null>>(new Map());
  const routeKey = route.key;
  useEffect(() => {
    if (rows.length === 0 || !route.hydrated) return;
    let cancelled = false;
    // A new basis or origin restarts the counts: no mixing old and new jumps.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPlaces(NO_PLACES);
    setSystemOf(new Map());
    /* eslint-enable react-hooks/set-state-in-effect */
    const distinct = [...new Map(rows.map((r) => [placeKey(r), r])).values()];
    void (async () => {
      const originSystemId =
        activeCharacterId === null
          ? null
          : await loadCharacterSolarSystemId(activeCharacterId).catch(() => null);
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
  return { places, systemOf };
}

interface MyShipsViewProps {
  /** The Character filter, already resolved to the Characters whose ships to list. */
  characterIds: readonly number[];
  activeCharacterId: number | null;
  /** Set while the filter reads "This character" and there are more Characters to show. */
  onShowAllCharacters?: () => void;
  /** Where a ship's location opens in the Assets browser. */
  hrefFor: (locationId: number) => string;
  route: JumpBasis;
}

/** Phone: a card (ship line, place line, then one meta line: character, Sec, Jumps). `sm` up: the table grid. The Character column only exists when more than one Character's ships are listed. */
const ROW_GRID_BASE = 'flex flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:gap-y-0.5';
const ROW_GRID_WITH_CHARACTER =
  'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.8fr)_2.5rem_4.5rem_2rem]';
const ROW_GRID_SINGLE_CHARACTER =
  'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.8fr)_2.5rem_4.5rem_2rem]';

type SortColumn = 'ship' | 'character' | 'location' | 'security' | 'jumps';

interface SortKeys {
  ship: string;
  character: string;
  location: string;
  security: number | null;
  jumps: number | null;
}

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

interface ShipRowViewProps {
  row: ShipRow;
  data: ShipData;
  rowGrid: string;
  showCharacter: boolean;
  placeName: string | null | undefined;
  systemId: number | null;
  security: number | null | undefined;
  jumps: JumpsAwayResult | undefined;
  shipClass: string | undefined;
  /** Where the ship's location opens in the Assets browser. */
  locationHref: string;
  preference: RoutePreferenceKind;
}

/**
 * One ship. Click opens Show info; the ⋮ button and a right-click or hold
 * reach the same menu: Show info, Show fitting, Plan route, Open location assets.
 */
function ShipRowView({
  row,
  data,
  rowGrid,
  showCharacter,
  placeName,
  systemId,
  security,
  jumps,
  shipClass,
  locationHref,
  preference,
}: ShipRowViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showInfo } = useItemActions();
  const holdGuard = useLiftAfterHoldGuard();
  const shipName =
    data.typeNames.get(row.typeId) ?? t('assets.myShips.unknownType', { id: row.typeId });
  const name =
    placeName ??
    (row.locationType === 'station'
      ? t('assets.stationLabel', { id: row.locationId })
      : t('assets.structureLabel', { id: row.locationId }));
  const trail = row.trail
    .map((itemId) => data.holderNames.get(itemId))
    .filter(Boolean)
    .join(' › ');
  const openFitting = () =>
    void shipItemsEditLocation(
      { typeId: row.typeId, name: shipName },
      data.contentsByShip.get(row.itemId) ?? []
    ).then((location) => {
      if (location) void navigate(location);
    });
  return (
    <RowActionsMenu
      name={shipName}
      items={
        <>
          <ShowInfoMenuItem typeId={row.typeId} itemName={shipName} />
          <MenuItem onSelect={openFitting}>{t('assets.myShips.menu.showFitting')}</MenuItem>
          {systemId !== null && (
            <MenuItem onSelect={() => void navigate(routeToHref(systemId, null, preference))}>
              {t('assets.myShips.menu.planRoute')}
            </MenuItem>
          )}
          <MenuItem onSelect={() => void navigate(locationHref)}>
            {t('assets.myShips.menu.openLocation')}
          </MenuItem>
        </>
      }
    >
      <div
        role="row"
        {...holdGuard.handlers}
        className={`${rowGrid} group relative border-b border-line px-3 py-2 hover:bg-panel-2 ${tappableRowClassName}`}
      >
        <span role="cell" className="flex min-w-0 items-center gap-2 max-sm:basis-full max-sm:pr-9">
          <TypeIcon typeId={row.typeId} size={32} width={24} height={24} />
          <span className="min-w-0 break-words">
            <button
              type="button"
              onClick={(event) => {
                if (holdGuard.swallowClick(event)) return;
                showInfo(row.typeId, shipName);
              }}
              className={`text-left font-semibold text-accent after:absolute after:inset-0 ${focusRingInsetClassName}`}
            >
              {shipName}
            </button>
            {shipClass && (
              <span className="text-xs text-text-dim max-sm:ml-2 sm:block">{shipClass}</span>
            )}
          </span>
          {row.inCargo && (
            <span className="shrink-0 rounded-xs border border-line px-1 text-[0.6875rem] text-text-dim">
              {t('assets.myShips.inCargo')}
            </span>
          )}
        </span>
        {showCharacter && (
          <span
            role="cell"
            className="min-w-0 text-xs break-words text-text-dim max-sm:order-3 max-sm:flex-1 max-sm:truncate"
          >
            {data.characterNames.get(row.characterId)}
          </span>
        )}
        <span role="cell" className="min-w-0 text-xs break-words max-sm:order-2 max-sm:basis-full">
          {name}
          {trail && <span className="text-text-dim"> · {trail}</span>}
        </span>
        <span role="cell" className="text-xs max-sm:order-4">
          <SecurityValue security={security} />
        </span>
        <span role="cell" className="text-xs whitespace-nowrap max-sm:order-5">
          {jumps?.kind === 'known' && jumps.jumps === 0 ? (
            <span>{t('assets.myShips.here')}</span>
          ) : (
            <JumpsAwayText result={jumps} t={t} />
          )}
        </span>
        <span className="relative flex max-sm:absolute max-sm:top-2 max-sm:right-2">
          <RowMoreActions />
        </span>
      </div>
    </RowActionsMenu>
  );
}

/**
 * My ships (issue #2853): every ship the chosen Characters own, nearest
 * first. The Assets page's Ships tab (`/assets/ships`).
 */
export function MyShipsView({
  characterIds,
  activeCharacterId,
  onShowAllCharacters,
  hrefFor,
  route,
}: MyShipsViewProps) {
  const { t } = useTranslation();
  const idsKey = [...characterIds].sort((a, b) => a - b).join(',');
  const [state, setState] = useState<ShipsState>({ status: 'loading' });
  useEffect(() => {
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
  }, [idsKey]);

  const rows = useMemo(() => (state.status === 'ready' ? state.data.rows : []), [state]);
  const { places, systemOf } = usePlaces(rows, activeCharacterId, route);
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
  const shipClasses = useShipClasses(groupIds);
  const [sort, setSort] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'jumps',
    direction: 'asc',
  });
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => {
    if (state.status !== 'ready') return [];
    const { data } = state;
    const describe = (row: ShipRow): SortKeys & { shipClass: string; trail: string } => {
      const key = placeKey(row);
      const jumps = places.jumps.get(key);
      const systemId = systemOf.get(key);
      return {
        ship: data.typeNames.get(row.typeId) ?? '',
        shipClass: shipClasses.get(data.groupIdByType.get(row.typeId) ?? -1) ?? '',
        character: data.characterNames.get(row.characterId) ?? '',
        location: places.names.get(key) ?? '',
        trail: row.trail.map((id) => data.holderNames.get(id) ?? '').join(' '),
        security: typeof systemId === 'number' ? (places.security.get(systemId) ?? null) : null,
        jumps: jumps?.kind === 'known' ? jumps.jumps : null,
      };
    };
    const needle = query.trim().toLowerCase();
    const items = rows
      .map((row) => ({ row, d: describe(row) }))
      .filter(
        ({ d }) =>
          needle === '' ||
          [d.ship, d.shipClass, d.location, d.trail].some((v) => v.toLowerCase().includes(needle))
      );
    const sign = sort.direction === 'asc' ? 1 : -1;
    items.sort((x, y) => {
      const va = x.d[sort.column] === '' ? null : x.d[sort.column];
      const vb = y.d[sort.column] === '' ? null : y.d[sort.column];
      // Unresolved values sort last in either direction.
      if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb));
      return cmp * sign;
    });
    return items.map((item) => item.row);
  }, [state, rows, places, systemOf, shipClasses, query, sort]);
  // One Character's ships need no Character column.
  const showCharacter = characterIds.length > 1;
  const columns = (
    showCharacter
      ? ['ship', 'character', 'location', 'security', 'jumps']
      : ['ship', 'location', 'security', 'jumps']
  ) as readonly SortColumn[];
  const rowGrid = `${ROW_GRID_BASE} ${showCharacter ? ROW_GRID_WITH_CHARACTER : ROW_GRID_SINGLE_CHARACTER}`;
  const toggleSort = (column: SortColumn) =>
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );

  return (
    <section
      aria-label={t('assets.myShips.title')}
      className="min-h-0 flex-1 overflow-y-auto rounded-xs border border-line bg-panel"
    >
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('assets.myShips.searchPlaceholder')}
            aria-label={t('assets.myShips.searchLabel')}
            className="w-full sm:ml-auto sm:w-64"
          />
        </div>
        {state.status === 'loading' && (
          <div className="flex justify-center py-10">
            <Spinner size="md" label={t('assets.myShips.loading')} />
          </div>
        )}
        {state.status === 'error' && <EmptyState title={t('assets.myShips.error')} />}
        {state.status === 'ready' && sorted.length === 0 && (
          <EmptyState
            title={t('assets.myShips.emptyTitle')}
            hint={query.trim() ? t('assets.myShips.noMatches') : t('assets.myShips.emptyHint')}
            action={
              !query.trim() &&
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
            <div
              role="row"
              className={`${rowGrid} border-b border-line px-3 py-1 text-[0.6875rem] tracking-widest text-text-dim uppercase max-sm:hidden`}
            >
              {columns.map((column) => {
                const active = sort.column === column;
                const SortGlyph = !active
                  ? Icon.Sort
                  : sort.direction === 'asc'
                    ? Icon.Ascending
                    : Icon.Descending;
                return (
                  <span
                    key={column}
                    role="columnheader"
                    aria-sort={
                      active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={`inline-flex items-center gap-1 tracking-widest uppercase hover:text-text ${focusRingClassName}`}
                    >
                      {t(`assets.myShips.columns.${column}`)}
                      <SortGlyph
                        aria-hidden="true"
                        size={Icon.ICON_SIZE.sm}
                        className={active ? 'text-accent' : 'text-text-faint'}
                      />
                    </button>
                  </span>
                );
              })}
              <span />
            </div>
            {sorted.map((row) => {
              const key = placeKey(row);
              const systemId = systemOf.get(key);
              return (
                <ShipRowView
                  key={row.itemId}
                  row={row}
                  data={state.data}
                  rowGrid={rowGrid}
                  showCharacter={showCharacter}
                  placeName={places.names.get(key)}
                  systemId={typeof systemId === 'number' ? systemId : null}
                  security={typeof systemId === 'number' ? places.security.get(systemId) : null}
                  jumps={places.jumps.get(key)}
                  shipClass={shipClasses.get(state.data.groupIdByType.get(row.typeId) ?? -1)}
                  locationHref={hrefFor(row.locationId)}
                  preference={route.rules.preference}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
