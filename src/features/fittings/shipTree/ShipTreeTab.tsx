/**
 * Ships › Tree (scope decision `20260926-135538`): the in-game Ship Tree,
 * one faction at a time, marked with the active Character's progress. A
 * map on a desktop and a ladder on a phone, either switchable, the choice
 * remembered. The faction lives in the URL (`?faction=`, ADR 0015); a hull
 * opens its Ship Info window. The page header and tab bar are the Ships
 * route's.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl, Spinner } from '@/components/ui';
import { intParam } from '@/lib/urlState';
import { useIsPhone } from '@/lib/useIsPhone';
import { useUrlParam } from '@/lib/useUrlState';
import type { ShipTreeShip } from '@/sde/types';
import { useActiveCharacter } from '@/stores/activeCharacter';
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
  const source = useShipTreeData(characterId);
  return (
    <div className="space-y-2">
      {source ? (
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
      <p className="text-[0.6875rem] text-text-faint">{t('ships.tree.credit')}</p>
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
      size="sm"
      label={t('ships.tree.view.label')}
      options={[
        { value: 'map', label: t('ships.tree.view.map') },
        { value: 'ladder', label: t('ships.tree.view.ladder') },
      ]}
      value={view}
      onChange={(next) => void setView(next)}
    />
  );
  const onFaction = (id: number) => setFaction(id);

  return (
    <>
      <FactionBar
        data={source.data}
        factionID={factionID}
        statuses={source.statuses}
        onFaction={onFaction}
      />
      {view === 'map' ? (
        <ShipTreeMap
          source={source}
          tree={tree}
          selectedTypeID={selected?.typeID ?? null}
          onFaction={onFaction}
          onOpenShip={setSelected}
          viewSwitch={viewSwitch}
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
