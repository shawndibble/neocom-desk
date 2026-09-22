/**
 * System name and raw security status for every distinct item-offer location,
 * out of the same local SDE snapshots `courierEndpoints.ts` resolves courier
 * endpoints from — `lookupNpcStation` then `lookupSolarSystem`, never ESI.
 * Item Offers has no equivalent of `CourierEndpoint` (it never needed a name,
 * a region or a space band — see `contractOffers.ts`), so this is the same
 * resolution narrowed to what a location column actually shows.
 *
 * Keyed by distinct location id, the `useRegionNames` pattern in
 * `contractSearchNames.ts`: the effect re-keys on *which ids* are present,
 * not on `rows`'s own identity, so a fresh but same-ids array (every
 * `useRouteSnapshot` revalidation hands one) never re-resolves and never
 * drops the map to empty while it does.
 */
import { useEffect, useMemo, useState } from 'react';
import { lookupNpcStation } from '@/sde/npcStations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';

/** One item-offer location, as far as the local snapshots place it. */
export interface OfferLocation {
  systemName: string | null;
  /** Raw ESI security status of the system — unrounded, the same float `CourierEndpoint.security` carries. */
  security: number | null;
}

const EMPTY_LOCATIONS: ReadonlyMap<number, OfferLocation> = new Map();

/** Nothing local places this id — a player structure or an unreadable table alike. */
const UNPLACED: OfferLocation = { systemName: null, security: null };

async function resolveOne(locationId: number): Promise<OfferLocation> {
  const station = await lookupNpcStation(locationId);
  // `undefined` (snapshot unreadable) and `null` (loaded, not an NPC station —
  // a player structure by elimination) both leave the location unplaced; only
  // the producer would know which, and nothing here needs to tell them apart.
  if (station == null) return UNPLACED;

  const system = await lookupSolarSystem(station.systemId);
  if (!system) return UNPLACED;
  return { systemName: system.name, security: system.security };
}

async function resolveLocations(
  ids: readonly number[]
): Promise<ReadonlyMap<number, OfferLocation>> {
  if (ids.length === 0) return EMPTY_LOCATIONS;
  const locations = new Map<number, OfferLocation>();
  await Promise.all(
    ids.map(async (id) => {
      locations.set(id, await resolveOne(id));
    })
  );
  return locations;
}

/**
 * One entry per distinct locationId; missing key = still resolving. Takes
 * anything with a `locationId`, so BPC Search's BPO cards (issue #1241) place
 * a station through the same lookup.
 *
 * Batches every distinct id in the rows into one `Promise.all` pass — a
 * location that is ten rows' worth of stock costs one lookup, the same
 * `loadCourierEndpoints` dedupe. Cancels on unmount or on the id set
 * changing, so a stale resolve from a superseded row set can never overwrite
 * a fresher one that lands first.
 */
export function useOfferLocations(
  rows: readonly Pick<PublicContractOfferRow, 'locationId'>[]
): ReadonlyMap<number, OfferLocation> {
  // Sorted and joined so the effect keys on *which* locations are listed, not
  // on the array reference a fresh snapshot read hands in on every
  // revalidation — the same trick `useRegionNames` uses, and for the same
  // reason: re-resolving (and briefly emptying the map) on every reload would
  // make a fully-loaded board flicker back to raw ids on its own refresh.
  const key = useMemo(
    () => [...new Set(rows.map((row) => row.locationId))].sort((a, b) => a - b).join(','),
    [rows]
  );
  const ids = useMemo(() => (key === '' ? [] : key.split(',').map(Number)), [key]);

  const [value, setValue] = useState<ReadonlyMap<number, OfferLocation>>(EMPTY_LOCATIONS);

  useEffect(() => {
    let cancelled = false;
    void resolveLocations(ids)
      .catch(() => EMPTY_LOCATIONS)
      .then((resolved) => {
        // The previous map stays on screen until this lands — an `ids` change
        // does not blank it, it just leaves the newly-added ids absent (still
        // resolving) in the meantime.
        if (!cancelled) setValue(resolved);
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return value;
}
