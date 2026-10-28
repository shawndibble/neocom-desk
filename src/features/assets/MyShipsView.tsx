import { idSetKey } from '@/lib/idSetKey';
import { useCallback, useMemo, useState } from 'react';
import { useReportSkipped } from './useReportSkipped';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  EmptyState,
  MenuItem,
  RowActionsMenu,
  RowMoreActions,
  SearchInput,
  Spinner,
  TypeIcon,
  CachedNotice,
} from '@/components/ui';
import { useLiftAfterHoldGuard } from '@/components/ui/liftAfterHold';
import { DataGate } from '@/components/DataGate';
import { OpenInEveItemMenuItems, ShowInfoMenuItem } from '@/features/market/ItemContextMenu';
import { useItemActions } from '@/features/market/itemActions';
import { shipItemsEditLocation } from '@/features/fittings/assetShipLocation';
import { useOpenInFittings } from '@/features/fittings/useOpenInFittings';
import { routeToHref } from '@/features/route/routeSafetyLink';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  focusRingInsetClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import type { ShipAssetItem } from '@/engine/fittings/assetShipMapper';
import { findShips, type OwnedAsset, type ShipRow } from '@/engine/myShips';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import { loadOtherCharactersAssetsDetailed, type SkippedCharacterAssets } from './assets';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { placeKey, usePlaceDetails } from '@/features/places';
import { loadGroupNames } from '@/features/market/groupNames';
import { JumpsAwayText, SecurityValue } from './assetBrowserRows';
import type { JumpBasis } from '@/features/route/jumpBasis';

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
  /** Chosen Characters whose assets could not be read: their ships are missing, not absent. */
  skipped: readonly SkippedCharacterAssets[];
  /** How many Characters' assets were read; zero with some skipped means nothing loaded at all. */
  loadedCount: number;
  /** When the oldest saved-copy list was read (ms); null when every list came from ESI. */
  cachedAt: number | null;
}

type ShipsState = { status: 'loading' } | { status: 'ready'; data: ShipData } | { status: 'error' };

/** SDE-backed ship lookup plus every chosen Character's ships. Cache-or-live, like the page's own cross-character read. */
async function loadShipData(characterIds: readonly number[]): Promise<ShipData> {
  const [{ entries, skipped, cachedAt }, types, groupCategories] = await Promise.all([
    loadOtherCharactersAssetsDetailed(characterIds),
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
      itemId: asset.item_id,
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
    skipped,
    loadedCount: entries.length,
    cachedAt: cachedAt ?? null,
  };
}

/** Flags worth naming; a container's own flag (Unlocked) adds nothing, so it reads as the holder name alone. */
const NAMED_HOLD_FLAGS = new Set(['ShipHangar', 'FleetHangar', 'Cargo']);

/** What holds a ship inside another asset, outermost first: "inside Orca (Ship Maintenance Bay) › Cargo Container". Empty for a free-standing ship. */
function holderTrail(row: ShipRow, holderNames: ReadonlyMap<number, string>, t: TFunction): string {
  const parts = row.trail.flatMap((itemId, i) => {
    const holder = holderNames.get(itemId);
    if (!holder) return [];
    const flag = row.holderFlags[i];
    return [
      flag && NAMED_HOLD_FLAGS.has(flag)
        ? t('assets.myShips.insideFlag', { holder, flag: t(`assets.myShips.flags.${flag}`) })
        : holder,
    ];
  });
  return parts.length === 0 ? '' : t('assets.myShips.inside', { holder: parts.join(' › ') });
}

/** The kind a ship's location resolves under: a station, a system, else a structure (`other`, or the parent of an item ESI never returned as an asset). */
function placeRefOf(row: ShipRow) {
  return {
    locationId: row.locationId,
    characterId: row.characterId,
    kind:
      row.locationType === 'station' || row.locationType === 'solar_system'
        ? row.locationType
        : ('structure' as const),
  };
}

/**
 * Names, security and jumps for every distinct place the ships sit in. Best
 * effort: each lands as it resolves and the list never waits on them.
 */
function usePlaces(rows: readonly ShipRow[], activeCharacterId: number | null, route: JumpBasis) {
  const loadOrigin = useCallback(
    () => loadCharacterSolarSystemId(activeCharacterId ?? 0).catch(() => null),
    [activeCharacterId]
  );
  const origin = useKeyedLoad(
    activeCharacterId === null ? null : String(activeCharacterId),
    loadOrigin
  );
  const originKnown = activeCharacterId === null || origin.status === 'ready';
  const refs = useMemo(() => rows.map(placeRefOf), [rows]);
  return usePlaceDetails(refs, {
    scopeId: activeCharacterId,
    origin: {
      systemId: activeCharacterId === null ? null : (origin.data ?? null),
      resolved: originKnown,
    },
    basis: route,
  });
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
  /** Reports the Characters this tab's read skipped, for the header picker's `missingNames`. */
  onSkippedChange?: (names: readonly string[] | undefined) => void;
}

/** Phone: a card (ship line, place line, then one meta line: character, Sec, Jumps). `sm` up: the table grid. The Character column only exists when more than one Character's ships are listed. */
const ROW_GRID_BASE = 'flex flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:gap-y-0.5';
const ROW_GRID_WITH_CHARACTER =
  'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.8fr)_2.5rem_10rem_2rem]';
const ROW_GRID_SINGLE_CHARACTER =
  'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.8fr)_2.5rem_10rem_2rem]';

type SortColumn = 'ship' | 'character' | 'location' | 'security' | 'jumps';

interface SortKeys {
  ship: string;
  character: string;
  location: string;
  security: number | null;
  jumps: number | null;
}

const NO_CLASSES: ReadonlyMap<number, string> = new Map();

/** Ship classes (SDE groups) by group id; lands after the list, which never waits on it. */
function useShipClasses(groupIds: readonly number[]): ReadonlyMap<number, string> {
  const idsKey = idSetKey(groupIds);
  const loadClasses = useCallback(
    () => loadGroupNames(idsKey.split(',').map(Number)).catch(() => NO_CLASSES),
    [idsKey]
  );
  const { data } = useKeyedLoad(idsKey === '' ? null : idsKey, loadClasses);
  return data ?? NO_CLASSES;
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
  const trail = holderTrail(row, data.holderNames, t);
  const openInFittings = useOpenInFittings();
  const openFitting = () =>
    openInFittings.open(() =>
      shipItemsEditLocation(
        { typeId: row.typeId, name: shipName },
        data.contentsByShip.get(row.itemId) ?? []
      )
    );
  return (
    <RowActionsMenu
      name={shipName}
      items={
        <>
          <ShowInfoMenuItem typeId={row.typeId} itemName={shipName} />
          <OpenInEveItemMenuItems typeId={row.typeId} />
          {!row.packaged && (
            <MenuItem onSelect={openFitting}>{t('assets.myShips.menu.showFitting')}</MenuItem>
          )}
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
            {row.quantity > 1 && (
              <span className="ml-1.5 text-xs text-text-dim tabular-nums">
                {t('assets.myShips.quantity', { count: row.quantity })}
              </span>
            )}
            {shipClass && (
              <span className="text-xs text-text-dim max-sm:ml-2 sm:block">{shipClass}</span>
            )}
          </span>
          {openInFittings.pending && (
            <Spinner size="sm" label={t('assets.myShips.openingFitting')} className="shrink-0" />
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
          {trail && (
            <span className="text-text-dim max-sm:block">
              <span className="max-sm:hidden"> · </span>
              {trail}
            </span>
          )}
        </span>
        <span role="cell" className="text-xs max-sm:order-4">
          <SecurityValue security={security} />
        </span>
        <span
          role="cell"
          className="flex items-center gap-2 text-xs whitespace-nowrap max-sm:order-5"
        >
          {jumps?.kind === 'known' && jumps.jumps === 0 ? (
            <span>{t('assets.myShips.here')}</span>
          ) : (
            <JumpsAwayText result={jumps} t={t} />
          )}
          {row.packaged && (
            <span className="shrink-0 rounded-xs border border-warning/40 px-1 text-[0.6875rem] text-warning">
              {t('assets.myShips.packaged')}
            </span>
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
  onSkippedChange,
}: MyShipsViewProps) {
  const { t } = useTranslation();
  const idsKey = idSetKey(characterIds);
  const loadShips = useCallback(
    () => loadShipData(idsKey === '' ? [] : idsKey.split(',').map(Number)),
    [idsKey]
  );
  // A manual retry re-keys the load so an all-skipped result blanks to the spinner, as before.
  const [retryTick, setRetryTick] = useState(0);
  const ships = useKeyedLoad(`${idsKey}#${retryTick}`, loadShips);
  const state = useMemo<ShipsState>(
    () =>
      ships.status === 'ready'
        ? { status: 'ready', data: ships.data }
        : { status: ships.status === 'failed' ? 'error' : 'loading' },
    [ships.status, ships.data]
  );

  const allSkipped =
    state.status === 'ready' && state.data.skipped.length > 0 && state.data.loadedCount === 0;
  // Who the read left out is the header picker's to say (its dot and "Not included" note).
  useReportSkipped(
    state.status === 'ready' ? state.data.skipped.map((c) => c.name) : undefined,
    onSkippedChange
  );
  const rows = useMemo(() => (state.status === 'ready' ? state.data.rows : []), [state]);
  const places = usePlaces(rows, activeCharacterId, route);
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
  // Keys that don't depend on the resolving places: built once per rows, not per places tick.
  const staticKeys = useMemo(() => {
    if (state.status !== 'ready') return [];
    const { data } = state;
    return rows.map((row) => ({
      row,
      ship: data.typeNames.get(row.typeId) ?? '',
      shipClass: shipClasses.get(data.groupIdByType.get(row.typeId) ?? -1) ?? '',
      character: data.characterNames.get(row.characterId) ?? '',
      trail: row.trail.map((id) => data.holderNames.get(id) ?? '').join(' '),
      packaged: row.packaged ? t('assets.myShips.packaged') : '',
    }));
  }, [state, rows, shipClasses, t]);
  const sorted = useMemo(() => {
    const describe = (
      base: (typeof staticKeys)[number]
    ): SortKeys & { shipClass: string; trail: string; packaged: string } => {
      const place = places.get(placeKey(base.row));
      const jumps = place?.jumps;
      return {
        ship: base.ship,
        shipClass: base.shipClass,
        character: base.character,
        location: place?.name ?? '',
        trail: base.trail,
        packaged: base.packaged,
        security: typeof place?.systemId === 'number' ? (place.security ?? null) : null,
        jumps: jumps?.kind === 'known' ? jumps.jumps : null,
      };
    };
    const needle = query.trim().toLowerCase();
    const items = staticKeys
      .map((base) => ({ row: base.row, d: describe(base) }))
      .filter(
        ({ d }) =>
          needle === '' ||
          [d.ship, d.shipClass, d.location, d.trail, d.packaged].some((v) =>
            v.toLowerCase().includes(needle)
          )
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
  }, [staticKeys, places, query, sort]);
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
        <DataGate
          status={
            state.status === 'loading'
              ? 'busy'
              : allSkipped || state.status === 'error'
                ? 'failed'
                : 'ok'
          }
          // Every chosen Character skipped (or the read threw): "No ships found" would be a guess.
          title={state.status === 'error' ? t('assets.myShips.error') : t('common.couldntLoad')}
          hint={allSkipped ? t('assets.skippedAllHint') : undefined}
          onRetry={() => setRetryTick((n) => n + 1)}
          resetKey={idsKey}
          className="flex flex-col gap-3"
          busy={
            <div className="flex justify-center py-10">
              <Spinner size="md" label={t('assets.myShips.loading')} />
            </div>
          }
        >
          {state.status === 'ready' && state.data.cachedAt !== null && (
            <CachedNotice fetchedAt={state.data.cachedAt} />
          )}
          {state.status === 'ready' && sorted.length === 0 && !allSkipped && (
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
                const place = places.get(placeKey(row));
                return (
                  <ShipRowView
                    key={row.itemId}
                    row={row}
                    data={state.data}
                    rowGrid={rowGrid}
                    showCharacter={showCharacter}
                    placeName={place?.name}
                    systemId={typeof place?.systemId === 'number' ? place.systemId : null}
                    security={typeof place?.systemId === 'number' ? place.security : null}
                    jumps={place?.jumps}
                    shipClass={shipClasses.get(state.data.groupIdByType.get(row.typeId) ?? -1)}
                    locationHref={hrefFor(row.locationId)}
                    preference={route.rules.preference}
                  />
                );
              })}
            </div>
          )}
        </DataGate>
      </div>
    </section>
  );
}
