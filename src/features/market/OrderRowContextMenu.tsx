import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import {
  resolveOrderLocation,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import type { RegionOrder } from '@/esi/endpoints';
import { formatMarketIsk } from '@/lib/isk';
import { writeToClipboard } from '@/lib/clipboard';
import { formatOrderLocationText } from './format';
import { priceClipboardText } from './priceClipboardText';
import { OpenInEveItemMenuItems, ShowInfoMenuItem } from './ItemContextMenu';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { SetWaypointMenuItem } from '@/features/travel/SetWaypointMenuItem';

export interface OrderRowContextMenuProps {
  order: RegionOrder;
  trigger: ReactElement;
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  onFilterToStation: (locationId: number) => void;
  typeId: number;
  itemName: string;
}

export function OrderRowContextMenu({
  order,
  trigger,
  npcStations,
  solarSystems,
  onFilterToStation,
  typeId,
  itemName,
}: OrderRowContextMenuProps) {
  const { t } = useTranslation();
  const location = resolveOrderLocation(order, npcStations, solarSystems);
  const locationText = formatOrderLocationText(location, t('market.unknownStructure'));
  const priceText = `${formatMarketIsk(order.price)} ISK`;

  return (
    <RowActionsMenu
      name={`${priceText}, ${locationText}`}
      items={
        <>
          <MenuItem onSelect={() => void writeToClipboard(locationText)}>
            {t('market.contextMenu.copyLocation')}
          </MenuItem>
          <MenuItem onSelect={() => void writeToClipboard(priceClipboardText(order.price))}>
            {t('market.contextMenu.copyPrice')}
          </MenuItem>
          <ShowInfoMenuItem typeId={typeId} itemName={itemName} />
          <OpenInEveItemMenuItems typeId={typeId} specific />
          <MenuItem onSelect={() => onFilterToStation(order.location_id)}>
            {t('market.contextMenu.filterToStation')}
          </MenuItem>
          <SetWaypointMenuItem locationId={order.location_id} placeName={locationText} />
          <OpenInEveMenuItem kind="information" id={order.location_id} />
        </>
      }
    >
      {trigger}
    </RowActionsMenu>
  );
}
