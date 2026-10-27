/**
 * The Incursions card's reads, mounted only while the card is switched on:
 * the pilot's location, their jump basis and the public feed are three
 * fetches a board that never shows the card has no business making. A
 * component rather than a hook on the route, because the reads it gates
 * (`useCurrentSystem`, the jump basis) start on mount and take no flag.
 *
 * The same read Route Safety's "Incursions near you" uses (`useIncursions`,
 * #3540). Renders nothing; it reports up to the route, which needs the rows
 * for the folded phone line as well as the card, and reports `null` when it
 * unmounts so a card switched back on never shows the last session's feed.
 */
import { useEffect, useMemo } from 'react';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { useIncursions } from '@/features/travel/useIncursions';
import type { IncursionsBoardData } from './data/incursionsBoard';

export function IncursionsBoardSource({
  refreshKey,
  onChange,
}: {
  /** Bumped by the board's Refresh: re-reads the feed. */
  refreshKey: number;
  /** Must be stable (a state setter): it is an effect dependency. */
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
