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
import { ShowInfoMenuItem } from './ItemContextMenu';
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
      // Price first: an order book lists many orders at one station, and the
      // price is what tells their buttons apart.
      name={`${priceText}, ${locationText}`}
      items={
        <>
          <MenuItem onSelect={() => void writeToClipboard(locationText)}>
            {t('market.contextMenu.copyLocation')}
          </MenuItem>
          {/* Plain digits, not `priceText` (#2294): this is where a trader
              copies a rival's price to post against, and EVE's own price
              field rejects the grouped, unit-suffixed display text. ESI
              prices already sit on a legal tick, so nothing rounds. */}
          <MenuItem onSelect={() => void writeToClipboard(priceClipboardText(order.price))}>
            {t('market.contextMenu.copyPrice')}
          </MenuItem>
          <ShowInfoMenuItem typeId={typeId} itemName={itemName} />
          <MenuItem onSelect={() => onFilterToStation(order.location_id)}>
            {t('market.contextMenu.filterToStation')}
          </MenuItem>
          {/* `location_id` is always the order's station or structure; the
              Location column's text names it, even an unnamed structure. */}
          <SetWaypointMenuItem locationId={order.location_id} placeName={locationText} />
        </>
      }
    >
      {trigger}
    </RowActionsMenu>
  );
}
