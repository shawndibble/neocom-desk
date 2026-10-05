import { useEffect, useRef, useState } from 'react';
import { isInArrivalWindow } from '@/engine/miningTax/oreArrival';

/** ESI caches the personal mining ledger for 10 minutes; asking sooner returns the same answer. */
export const RECHECK_INTERVAL_MS = 10 * 60_000;

interface SettleUpRecheckOptions {
  /** The EVE dates of the entries Settle up is open on; `null` while it is closed. */
  dates: readonly string[] | null;
  /** The Tax tab's refresh: a live ledger read for every character. */
  refresh: () => void;
  /** The Tax tab's snapshot is loading. */
  loading: boolean;
}

export interface SettleUpRecheck {
  /** A pull this hook started is still running. */
  checking: boolean;
  /** When the latest pull started; `null` until one has. */
  pullStartedAt: number | null;
}

interface Pull {
  startedAt: number;
  /** `loading` has gone true since: the refresh flips it a render later, so "not loading" before that is not "done". */
  sawLoading: boolean;
  done: boolean;
}

/**
 * Settle up's fresh ledger pulls (scope decision 20261004 "settle up waits for
 * ore still arriving"): one as it opens, so the check never judges a page left
 * open since lunch, then one per ESI cache window while it stays open, so a
 * pilot waiting in the dialog watches the warning clear on its own. Only while
 * an entry on offer could still grow — otherwise there is nothing to wait for.
 */
export function useSettleUpRecheck({
  dates,
  refresh,
  loading,
}: SettleUpRecheckOptions): SettleUpRecheck {
  const [pull, setPull] = useState<Pull | null>(null);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // A string, so a re-render with the same dates in a new array keeps the interval.
  const datesKey = dates === null ? null : [...new Set(dates)].sort().join(',');

  useEffect(() => {
    if (datesKey === null) return;
    const open = datesKey.split(',');
    const canGrow = () => open.some((date) => isInArrivalWindow(date, Date.now()));
    if (!canGrow()) return;
    const start = () => {
      setPull({ startedAt: Date.now(), sawLoading: false, done: false });
      refreshRef.current();
    };
    start();
    const id = setInterval(() => {
      if (canGrow()) start();
      else clearInterval(id);
    }, RECHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [datesKey]);

  // Follows the refresh it started through `loading`, adjusted during render.
  if (pull && !pull.done) {
    if (loading && !pull.sawLoading) setPull({ ...pull, sawLoading: true });
    else if (!loading && pull.sawLoading) setPull({ ...pull, done: true });
  }

  if (datesKey === null || !pull) return { checking: false, pullStartedAt: null };
  return { checking: !pull.done, pullStartedAt: pull.startedAt };
}
