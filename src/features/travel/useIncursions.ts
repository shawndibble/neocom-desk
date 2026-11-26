import { NO_NAMES } from '@/lib/emptyCollections';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildIncursionRows, type IncursionRow } from '@/engine/incursions/incursionRows';
import {
  useJumpRangeFilter,
  type CurrentSystemState,
  type JumpDistanceStatus,
} from '@/features/route/currentSystem';
import { loadConstellationNames, loadIncursions, type IncursionsFeed } from './incursionsData';

export interface IncursionsRead {
  feed: IncursionsFeed | null | undefined;
  rows: IncursionRow[];
  constellationNames: ReadonlyMap<number, string>;
  jumpsStatus: JumpDistanceStatus;
  retry: () => void;
}

export function useIncursions(
  current: Pick<CurrentSystemState, 'systemId' | 'loaded'>,
  refreshKey = 0
): IncursionsRead {
  const { jumps, jumpsStatus } = useJumpRangeFilter(current, 'any');
  const [feed, setFeed] = useState<IncursionsFeed | null | undefined>(undefined);
  const [constellationNames, setConstellationNames] = useState(NO_NAMES);
  const [attempt, setAttempt] = useState(0);

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
  }, [attempt, refreshKey]);

  const rows = useMemo(
    () => (feed ? buildIncursionRows(feed.entries, jumpsStatus === 'ready' ? jumps : null) : []),
    [feed, jumps, jumpsStatus]
  );
  const retry = useCallback(() => {
    setFeed(undefined);
    setAttempt((n) => n + 1);
  }, []);

  return { feed, rows, constellationNames, jumpsStatus, retry };
}
