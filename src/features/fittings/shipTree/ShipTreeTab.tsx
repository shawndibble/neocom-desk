/**
 * Ships › Tree (scope decision `20260926-135538`): the in-game Ship Tree,
 * one faction at a time, marked with the active Character's progress. A
 * map on a desktop and a ladder on a phone, either switchable, the choice
 * remembered. The faction lives in the URL (`?faction=`, ADR 0015); a hull
 * opens its Ship Info window. The page header and tab bar are the Ships
 * route's.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, SegmentedControl, Spinner } from '@/components/ui';
import { ENTITY_INFO_PUSHED_STATE, wasPushedHere } from '@/features/entities/entityInfoState';
import { enumParam, enumSetParam, intParam, optionalIdParam } from '@/lib/urlState';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useIsPhone } from '@/lib/useIsPhone';
import { useUrlParams } from '@/lib/useUrlState';
import type { ShipTreeShip } from '@/sde/types';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { FactionBar } from './FactionBar';
import { ShipInfoWindow } from './ShipInfoWindow';
import { ShipTreeLadder } from './ShipTreeLadder';
import { ShipTreeMap } from './ShipTreeMap';
import {
  DEFAULT_FACTION_ID,
  factionMatchCounts,
  isShipTreeFiltered,
  MASTERY_TIERS,
  resolveFactionID,
  type ShipTreeFilter,
} from './shipTreeModel';
import {
  resolveShipTreeView,
  useShipTreeViewPreference,
  type ShipTreeView,
} from './shipTreeViewPreference';
import { useFactionTree } from './useFactionTree';
import { useShipTreeData, type ShipTreeSource } from './useShipTreeData';
import { useHydratedStore } from '@/lib/useHydratedStore';
import './shipTree.css';

const MASTERY_KEYS = MASTERY_TIERS.map(String);
// One group: a tap that switches faction from a filtered empty state writes
// both, and two hooks writing in one tick would drop the first (ADR 0015).
const TREE_PARAMS = {
  faction: intParam(DEFAULT_FACTION_ID, { min: 0 }),
  fly: enumParam(['all', 'canFly', 'cantFly'] as const, 'all'),
  mastery: enumSetParam(MASTERY_KEYS, []),
  // The hull whose Ship Info window is open: linkable, so the palette can open it.
  ship: optionalIdParam(),
};

export function ShipTreeTab() {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const { source, retry } = useShipTreeData(characterId);
  const online = useOnline();
  // Retry unmounts while the tree loads, so the always-mounted wrapper holds focus meanwhile.
  const [focusRef, , holdFocus] = useRetryFocus<HTMLDivElement>(
    source === 'failed' ? 'failed' : source ? 'ok' : 'busy',
    characterId
  );
  return (
    <div ref={focusRef} tabIndex={-1} className="space-y-2 focus:outline-none">
      {source === 'failed' ? (
        <EmptyState
          title={t('ships.tree.loadFailed')}
          hint={t(online ? 'ships.tree.loadFailedHint' : 'ships.tree.loadFailedOffline')}
          action={
            <Button
              onClick={() => {
                holdFocus();
                retry();
              }}
            >
              {t('common.retry')}
            </Button>
          }
        />
      ) : source ? (
        <ShipTree source={source} />
      ) : (
        <div className="flex items-center gap-2 py-8 text-sm text-text-dim">
          <Spinner size="sm" />
          <span>{t('ships.tree.loading')}</span>
        </div>
      )}
      {characterId === null && (
        <p className="text-xs text-text-dim">{t('ships.tree.noCharacter')}</p>
      )}
      <p className="text-[0.6875rem] text-text-dim">{t('ships.tree.credit')}</p>
    </div>
  );
}

function ShipTree({ source }: { source: ShipTreeSource }) {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(TREE_PARAMS);
  const factionID = resolveFactionID(source.data, params.faction);
  // Until the Mastery data loads every hull reads tier 0, so a Mastery pick
  // (from the URL) is set aside rather than emptying the ladder; it stays in
  // the URL and applies once the data arrives.
  const masteriesLoaded = source.masteriesStatus === 'loaded';
  const filter = useMemo<ShipTreeFilter>(
    () => ({
      fly: params.fly,
      mastery: masteriesLoaded ? new Set([...params.mastery].map(Number)) : new Set(),
    }),
    [params.fly, params.mastery, masteriesLoaded]
  );
  const setFilter = useCallback(
    (next: ShipTreeFilter) =>
      setParams(
        masteriesLoaded
          ? { fly: next.fly, mastery: new Set([...next.mastery].map(String)) }
          : { fly: next.fly }
      ),
    [setParams, masteriesLoaded]
  );
  const tree = useFactionTree(source, factionID);
  const navigate = useNavigate();
  const location = useLocation();
  const selected = useMemo<ShipTreeShip | null>(
    () =>
      params.ship === null
        ? null
        : (source.data.ships.find((ship) => ship.typeID === params.ship) ?? null),
    [params.ship, source.data.ships]
  );
  // Arrival with `?ship=`: show the faction behind the window; an unknown id
  // is dropped without a word.
  // Once per hull: the window is non-modal on a desktop, so a later faction pick stands.
  const shownFor = useRef<number | null>(null);
  useEffect(() => {
    if (params.ship === null) {
      shownFor.current = null;
      return;
    }
    if (!selected) setParams({ ship: null });
    else if (shownFor.current !== selected.typeID) {
      shownFor.current = selected.typeID;
      if (selected.factionID !== params.faction) setParams({ faction: selected.factionID });
    }
  }, [params.ship, params.faction, selected, setParams]);
  // A hull opened while a window is already open replaces; otherwise Back closes it.
  const openShip = useCallback(
    (ship: ShipTreeShip) =>
      setParams(
        { ship: ship.typeID, faction: ship.factionID },
        params.ship === null ? { push: true, state: ENTITY_INFO_PUSHED_STATE } : undefined
      ),
    [setParams, params.ship]
  );
  // ADR 0015's entity-modal rule: Back when the app pushed the entry, else replace.
  const closeShip = useCallback(() => {
    if (wasPushedHere(location.state)) void navigate(-1);
    else setParams({ ship: null });
  }, [location.state, navigate, setParams]);

  const isPhone = useIsPhone();
  const storedView = useShipTreeViewPreference((state) => state.value);
  const setView = useShipTreeViewPreference((state) => state.setValue);
  useHydratedStore(useShipTreeViewPreference);
  const view = resolveShipTreeView(storedView, isPhone);

  const viewSwitch = (
    <SegmentedControl<ShipTreeView>
      size="md"
      label={t('ships.tree.view.label')}
      options={[
        { value: 'map', label: t('ships.tree.view.map') },
        { value: 'ladder', label: t('ships.tree.view.ladder') },
      ]}
      value={view}
      onChange={(next) => void setView(next)}
    />
  );
  const onFaction = useCallback((id: number) => setParams({ faction: id }), [setParams]);
  const factionMatches = useMemo(
    () =>
      view === 'ladder' && isShipTreeFiltered(filter)
        ? factionMatchCounts(
            source.data.factions.map((f) => f.id),
            source.data.ships,
            source.statuses,
            filter
          )
        : undefined,
    [view, filter, source.data, source.statuses]
  );

  // Above a phone's map; under the ladder's toolbar, whose filters change its counts.
  const factionBar = (
    <FactionBar
      data={source.data}
      factionID={factionID}
      statuses={source.statuses}
      matches={factionMatches}
      onFaction={onFaction}
    />
  );

  return (
    <>
      {source.masteriesStatus === 'unavailable' && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
          <span>{t('ships.tree.masteriesUnavailable')}</span>
          <Button size="sm" onClick={source.retryMasteries}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      {view === 'map' && isPhone && factionBar}
      {view === 'map' ? (
        <ShipTreeMap
          source={source}
          tree={tree}
          selectedTypeID={selected?.typeID ?? null}
          onFaction={onFaction}
          onOpenShip={openShip}
          viewSwitch={viewSwitch}
          showFactionGrid={!isPhone}
        />
      ) : (
        <ShipTreeLadder
          source={source}
          tree={tree}
          filter={filter}
          onFilter={setFilter}
          factionMatches={factionMatches}
          factionBar={factionBar}
          selectedTypeID={selected?.typeID ?? null}
          onFaction={onFaction}
          onOpenShip={openShip}
          viewSwitch={viewSwitch}
        />
      )}
      <ShipInfoWindow ship={selected} source={source} onClose={closeShip} />
    </>
  );
}
