/**
 * Right-click menu for an order row (issue #6): copy the location, copy the
 * price, show the item's info, and filter the book down to this one station
 * — the move CONTEXT.md says the whole tool exists to support. The station
 * filter is undone via the banner Market.tsx renders above the tables, not
 * from here. Every row in an order book is for the same selected item, so
 * typeId/itemName come from the caller rather than the row itself.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui';
import {
  resolveOrderLocation,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import type { RegionOrder } from '@/esi/endpoints';
import { formatIsk } from '@/lib/isk';
import { writeToClipboard } from '@/lib/clipboard';
import { formatOrderLocationText } from './format';

export interface OrderRowContextMenuProps {
  order: RegionOrder;
  trigger: ReactElement;
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  onFilterToStation: (locationId: number) => void;
  typeId: number;
  itemName: string;
  onShowInfo: (typeId: number, itemName: string) => void;
}

export function OrderRowContextMenu({
  order,
  trigger,
  npcStations,
  solarSystems,
  onFilterToStation,
  typeId,
  itemName,
  onShowInfo,
}: OrderRowContextMenuProps) {
  const { t } = useTranslation();
  const location = resolveOrderLocation(order, npcStations, solarSystems);
  const locationText = formatOrderLocationText(location, t('market.unknownStructure'));
  const priceText = `${formatIsk(order.price, 2)} ISK`;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void writeToClipboard(locationText)}>
          {t('market.contextMenu.copyLocation')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void writeToClipboard(priceText)}>
          {t('market.contextMenu.copyPrice')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onShowInfo(typeId, itemName)}>
          {t('market.contextMenu.showInfo')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onFilterToStation(order.location_id)}>
          {t('market.contextMenu.filterToStation')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
