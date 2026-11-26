import { useEffect, useMemo } from 'react';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { useIncursions } from '@/features/travel/useIncursions';
import type { IncursionsBoardData } from './data/incursionsBoard';

export function IncursionsBoardSource({
  refreshKey,
  onChange,
}: {
  refreshKey: number;
  onChange: (data: IncursionsBoardData | null) => void;
}) {
  const current = useCurrentSystem();
  const { feed, rows, constellationNames, jumpsStatus } = useIncursions(current, refreshKey);
  const systems = useSolarSystemIndex();

  const systemNames = useMemo(
    () =>
      new Map(
        rows.flatMap((row) => {
          const name = systems?.get(row.stagingSystemId)?.name;
          return name === undefined ? [] : [[row.stagingSystemId, name] as const];
        })
      ),
    [rows, systems]
  );

  const status = feed === undefined ? 'loading' : feed === null ? 'failed' : 'ready';
  useEffect(() => {
    onChange({ status, rows, jumpsStatus, systemNames, constellationNames });
  }, [onChange, status, rows, jumpsStatus, systemNames, constellationNames]);
  useEffect(() => () => onChange(null), [onChange]);

  return null;
}
