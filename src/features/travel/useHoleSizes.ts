import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { buildHoleSizes, type HoleSizeRead } from '@/engine/pilotList/dscanHoleSize';
import type { HullCount } from '@/engine/pilotList/dscanWorth';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadShipMass } from '@/sde/loadSde';

// One stable loader (a new one per render would refresh the load each time),
// wrapped so `loadShipMass` is only touched once there is something to load.
const loadMassTable = () => loadShipMass();

/**
 * The hole sizes and base hull mass of a scan's ships (issue #5669), read only
 * in wormhole space. Null outside it, while the ship-mass table loads, or if it fails.
 */
export function useHoleSizes(hulls: readonly HullCount[], wormholeSpace: boolean) {
  const table = useKeyedLoad(wormholeSpace ? 'shipMass' : null, loadMassTable).data;
  return useMemo<HoleSizeRead | null>(
    () =>
      !wormholeSpace || table === undefined
        ? null
        : buildHoleSizes(
            hulls,
            (typeId) => table[String(typeId)]?.[1],
            (typeId) => table[String(typeId)]?.[2]
          ),
    [hulls, table, wormholeSpace]
  );
}

/** "Small 1 · Medium 3 · 1 not sized": shared by the danger answer and the Worth card. */
export function holeSizeCounts(t: TFunction, read: HoleSizeRead): string {
  return [
    ...read.sizes.map(({ size, count }) =>
      t('travel.pilot.dscan.worth.holes.size', { size: t(`travel.thera.size.${size}`), count })
    ),
    ...(read.unsized > 0
      ? [t('travel.pilot.dscan.worth.holes.unsized', { count: read.unsized })]
      : []),
  ].join(' · ');
}
