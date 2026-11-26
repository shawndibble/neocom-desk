import { useEffect, useMemo, useState } from 'react';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { NpcStationEntry } from '@/sde/marketTypes';
import {
  useCurrentSystem,
  useJumpRangeFilter,
  type JumpDistanceStatus,
} from '@/features/route/currentSystem';
import { nearestNpcStation, type NearestNpcStation } from './nearestNpcStation';

export interface NearestStationState {
  loading: boolean;
  station: NearestNpcStation | null;
  jumpsStatus: JumpDistanceStatus;
}

export function useNearestStation(corporationId: number | null): NearestStationState {
  const current = useCurrentSystem();
  const { jumps, jumpsStatus } = useJumpRangeFilter(current, 'any');
  const [stations, setStations] = useState<NpcStationEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (corporationId === null) return;
    let cancelled = false;
    loadNpcStations().then(
      (list) => {
        if (cancelled) return;
        setStations(list);
        setFailed(false);
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [corporationId]);

  const station = useMemo(
    () =>
      corporationId === null || !stations
        ? null
        : nearestNpcStation(corporationId, stations, jumps),
    [corporationId, stations, jumps]
  );
  return {
    loading: corporationId !== null && stations === null && !failed,
    station,
    jumpsStatus,
  };
}
