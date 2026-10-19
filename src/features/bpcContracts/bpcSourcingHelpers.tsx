import type { ReactNode } from 'react';
import type { BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { SetWaypointMenuItem } from '@/features/travel/SetWaypointMenuItem';
import type { SourceToggle } from './bpcSourcingUrl';
import { TRADE_HUBS } from '@/market/hubs';

/**
 * Rows the table shows, taken from the top of the current sort. A broad
 * search can match six figures of synced contracts; past a couple of hundred
 * the answer is to narrow the search, not to scroll.
 */
export const RESULT_LIMIT = 200;

/** The market lookup's region: the Region filter's, else the pilot's market hub's once known. */
export function marketLookupRegion(
  regionId: number | null,
  hubHydrated: boolean,
  hubRegionId: number
): number | null {
  if (regionId !== null) return regionId;
  return hubHydrated ? hubRegionId : null;
}

/**
 * "Set waypoint in game" for a row whose Location names its station or
 * structure; nothing for one that names none (an unresolved location, or an
 * owned blueprint inside a container or ship).
 */
export function waypointItemFor(
  row: BpcSearchRow,
  ownedPlaceIds: ReadonlyMap<number, number>
): ReactNode {
  const waypoint = waypointOnlyItemFor(row, ownedPlaceIds);
  // A contract row also opens its window in the EVE client.
  if (row.source !== 'contract') return waypoint;
  return (
    <>
      {waypoint}
      <OpenInEveMenuItem kind="contract" id={row.contract.contractId} />
    </>
  );
}

function waypointOnlyItemFor(
  row: BpcSearchRow,
  ownedPlaceIds: ReadonlyMap<number, number>
): ReactNode {
  if (row.locationName === null) return null;
  const placeId =
    row.source === 'contract'
      ? row.contract.locationId
      : row.source === 'market'
        ? row.locationId
        : row.source === 'owned'
          ? ownedPlaceIds.get(row.itemId)
          : undefined;
  return placeId === undefined ? null : (
    <>
      <SetWaypointMenuItem locationId={placeId} placeName={row.locationName} />
      <OpenInEveMenuItem kind="information" id={placeId} />
    </>
  );
}

/** The Trade Hub station in `regionId`, or 0 when the region holds none — nothing gets marked. */
export function hubStationIn(regionId: number | null): number {
  return TRADE_HUBS.find((hub) => hub.regionId === regionId)?.stationId ?? 0;
}

export const OFFERS_DEFAULT_SORT = { columnId: 'price', direction: 'asc' } as const;

export const SOURCE_LABEL_KEYS: Record<SourceToggle, string> = {
  contract: 'bpcContracts.sourceContracts',
  contractBpo: 'bpcContracts.sourceContractBpos',
  market: 'bpcContracts.sourceMarketBpos',
  lp: 'bpcContracts.sourceLpStore',
  community: 'bpcContracts.sourceCommunity',
  owned: 'bpcContracts.sourceOwned',
};

export const SOURCE_TOOLTIP_KEYS: Partial<Record<SourceToggle, string>> = {
  contractBpo: 'bpcContracts.sourceContractBposTooltip',
  market: 'bpcContracts.sourceMarketBposTooltip',
  lp: 'bpcContracts.sourceLpStoreTooltip',
  community: 'bpcContracts.sourceCommunityTooltip',
};
