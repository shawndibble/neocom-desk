/**
 * Ships › Tree (scope decision `20260926-135538`): the in-game Ship Tree,
 * one faction at a time, marked with the active Character's progress. A
 * map on a desktop and a ladder on a phone, either switchable, the choice
 * remembered. The faction lives in the URL (`?faction=`, ADR 0015); a hull
 * opens its Ship Info window. The page header and tab bar are the Ships
 * route's.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, SegmentedControl, Spinner } from '@/components/ui';
import { intParam } from '@/lib/urlState';
import { useIsPhone } from '@/lib/useIsPhone';
import { useUrlParam } from '@/lib/useUrlState';
import type { ShipTreeShip } from '@/sde/types';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { FactionBar } from './FactionBar';
import { ShipInfoWindow } from './ShipInfoWindow';
import { ShipTreeLadder } from './ShipTreeLadder';
import { ShipTreeMap } from './ShipTreeMap';
import { DEFAULT_FACTION_ID, resolveFactionID } from './shipTreeModel';
import {
  resolveShipTreeView,
  useShipTreeViewPreference,
  type ShipTreeView,
} from './shipTreeViewPreference';
import { useFactionTree } from './useFactionTree';
import { useShipTreeData, type ShipTreeSource } from './useShipTreeData';
import './shipTree.css';

const FACTION_PARAM = intParam(DEFAULT_FACTION_ID, { min: 0 });

export function ShipTreeTab() {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const { source, retry } = useShipTreeData(characterId);
  const online = useOnline();
  return (
    <div className="space-y-2">
      {source === 'failed' ? (
        <EmptyState
          title={t('ships.tree.loadFailed')}
          hint={t(online ? 'ships.tree.loadFailedHint' : 'ships.tree.loadFailedOffline')}
          action={<Button onClick={retry}>{t('ships.tree.retry')}</Button>}
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
  const [requested, setFaction] = useUrlParam('faction', FACTION_PARAM);
  const factionID = resolveFactionID(source.data, requested);
  const tree = useFactionTree(source, factionID);
  const [selected, setSelected] = useState<ShipTreeShip | null>(null);

  const isPhone = useIsPhone();
  const storedView = useShipTreeViewPreference((state) => state.value);
  const hydrateView = useShipTreeViewPreference((state) => state.hydrate);
  const setView = useShipTreeViewPreference((state) => state.setValue);
  useEffect(() => {
    void hydrateView();
  }, [hydrateView]);
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
  const onFaction = useCallback((id: number) => setFaction(id), [setFaction]);

  return (
    <>
      {source.masteriesStatus === 'unavailable' && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
          <span>{t('ships.tree.masteriesUnavailable')}</span>
          <Button size="sm" onClick={source.retryMasteries}>
            {t('ships.tree.retry')}
          </Button>
        </p>
      )}
      {(view === 'ladder' || isPhone) && (
        <FactionBar
          data={source.data}
          factionID={factionID}
          statuses={source.statuses}
          onFaction={onFaction}
        />
      )}
      {view === 'map' ? (
        <ShipTreeMap
          source={source}
          tree={tree}
          selectedTypeID={selected?.typeID ?? null}
          onFaction={onFaction}
          onOpenShip={setSelected}
          viewSwitch={viewSwitch}
          showFactionGrid={!isPhone}
        />
      ) : (
        <ShipTreeLadder
          source={source}
          tree={tree}
          onFaction={onFaction}
          onOpenShip={setSelected}
          viewSwitch={viewSwitch}
        />
      )}
      <ShipInfoWindow ship={selected} source={source} onClose={() => setSelected(null)} />
    </>
  );
}
