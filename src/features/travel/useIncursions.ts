import { NO_NAMES } from '@/lib/emptyCollections';
/**
 * Every active Incursion, nearest first from the pilot's Current System with
 * their own jump basis: the one read behind Route Safety's "Incursions near
 * you" (#3540) and the Overview's Incursions card (#3541), so the two can
 * never disagree about a distance.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildIncursionRows, type IncursionRow } from '@/engine/incursions/incursionRows';
import {
  useJumpRangeFilter,
  type CurrentSystemState,
  type JumpDistanceStatus,
} from '@/features/route/currentSystem';
import { loadConstellationNames, loadIncursions, type IncursionsFeed } from './incursionsData';

export interface IncursionsRead {
  /** `undefined` while reading; `null` when the feed could not be read and nothing was cached. */
  feed: IncursionsFeed | null | undefined;
  /** Nearest first; empty until the feed is read. */
  rows: IncursionRow[];
  constellationNames: ReadonlyMap<number, string>;
  jumpsStatus: JumpDistanceStatus;
  /** Back to "reading…" and read the feed again. */
  retry: () => void;
}

/** `refreshKey`: bump it to re-read the feed in place, keeping the last rows meanwhile. */
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
