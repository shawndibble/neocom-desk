import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { buildHoleSizes, type HoleSizeRead } from '@/engine/pilotList/dscanHoleSize';
import type { HullCount } from '@/engine/pilotList/dscanWorth';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadShipMass } from '@/sde/loadSde';

const loadMassTable = () => loadShipMass();

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
