/**
 * The Incursions card's reads, mounted only while the card is switched on:
 * the pilot's location, their jump basis and the public feed are three
 * fetches a board that never shows the card has no business making.
 *
 * The same loader and jump basis Route Safety's "Incursions near you" uses
 * (#3540) — `loadIncursions` and `useJumpRangeFilter` — so the card and the
 * panel can never disagree about a distance. Renders nothing; it reports up
 * to the route, which needs the rows for the folded phone line as well as the
 * card.
 */
import { useEffect, useMemo, useState } from 'react';
import { buildIncursionRows } from '@/engine/incursions/incursionRows';
import { useCurrentSystem, useJumpRangeFilter } from '@/features/route/currentSystem';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import {
  loadConstellationNames,
  loadIncursions,
  type IncursionsFeed,
} from '@/features/travel/incursionsData';
import type { IncursionsBoardData } from './incursionsBoard';

const NO_NAMES: ReadonlyMap<number, string> = new Map();

export function IncursionsBoardSource({
  refreshKey,
  onChange,
}: {
  /** Bumped by the board's Refresh: re-reads the feed. */
  refreshKey: number;
  onChange: (data: IncursionsBoardData) => void;
}) {
  const current = useCurrentSystem();
  const { jumps, jumpsStatus } = useJumpRangeFilter(current, 'any');
  const systems = useSolarSystemIndex();
  const [feed, setFeed] = useState<IncursionsFeed | null | undefined>(undefined);
  const [constellationNames, setConstellationNames] = useState(NO_NAMES);

  useEffect(() => {
    let live = true;
    void loadIncursions().then((result) => {
      if (!live) return;
      setFeed(result);
      if (result) {
        void loadConstellationNames(result.entries.map((e) => e.constellation_id)).then((n) => {
          if (live) setConstellationNames(n);
        });
      }
    });
    return () => {
      live = false;
    };
  }, [refreshKey]);

  const rows = useMemo(
    () => (feed ? buildIncursionRows(feed.entries, jumpsStatus === 'ready' ? jumps : null) : []),
    [feed, jumps, jumpsStatus]
  );
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

  return null;
}
