import { useEffect, useRef, useState } from 'react';

/** ESI caches the personal mining ledger for 10 minutes; asking sooner returns the same answer. */
export const RECHECK_INTERVAL_MS = 10 * 60_000;

interface SettleUpRecheckOptions {
  /** Settle up is open on entries that could still grow — the only time a pull is worth it. */
  active: boolean;
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
 * pilot waiting in the dialog watches the warning clear on its own.
 */
export function useSettleUpRecheck({
  active,
  refresh,
  loading,
}: SettleUpRecheckOptions): SettleUpRecheck {
  const [pull, setPull] = useState<Pull | null>(null);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const start = () => {
      setPull({ startedAt: Date.now(), sawLoading: false, done: false });
      refreshRef.current();
    };
    start();
    const id = setInterval(start, RECHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);

  // Follows the refresh it started through `loading`, adjusted during render.
  if (pull && !pull.done) {
    if (loading && !pull.sawLoading) setPull({ ...pull, sawLoading: true });
    else if (!loading && pull.sawLoading) setPull({ ...pull, done: true });
  }

  if (!active || !pull) return { checking: false, pullStartedAt: null };
  return { checking: !pull.done, pullStartedAt: pull.startedAt };
}
