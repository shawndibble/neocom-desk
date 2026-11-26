import { idSetKey } from '@/lib/idSetKey';
import { useEffect, useMemo, useState } from 'react';
import { lookupNpcStation } from '@/sde/npcStations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';

export interface OfferLocation {
  systemId: number | null;
  systemName: string | null;
  security: number | null;
}

const EMPTY_LOCATIONS: ReadonlyMap<number, OfferLocation> = new Map();

const UNPLACED: OfferLocation = { systemId: null, systemName: null, security: null };

async function resolveOne(locationId: number): Promise<OfferLocation> {
  const station = await lookupNpcStation(locationId);
  if (station == null) return UNPLACED;

  const system = await lookupSolarSystem(station.systemId);
  if (!system) return UNPLACED;
  return { systemId: system.id, systemName: system.name, security: system.security };
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

export function useOfferLocations(
  rows: readonly Pick<PublicContractOfferRow, 'locationId'>[]
): ReadonlyMap<number, OfferLocation> {
  const key = useMemo(() => idSetKey(rows.map((row) => row.locationId)), [rows]);
  const ids = useMemo(() => (key === '' ? [] : key.split(',').map(Number)), [key]);

  const [value, setValue] = useState<ReadonlyMap<number, OfferLocation>>(EMPTY_LOCATIONS);

  useEffect(() => {
    let cancelled = false;
    void resolveLocations(ids)
      .catch(() => EMPTY_LOCATIONS)
      .then((resolved) => {
        if (!cancelled) setValue(resolved);
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return value;
}
