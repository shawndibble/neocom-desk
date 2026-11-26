import { useEffect, useRef, useState } from 'react';
import { isInArrivalWindow } from '@/engine/miningTax/oreArrival';
import { MINUTE_MS } from '@/lib/age';

export const RECHECK_INTERVAL_MS = 10 * MINUTE_MS;

interface SettleUpRecheckOptions {
  dates: readonly string[] | null;
  refresh: () => void;
  loading: boolean;
}

export interface SettleUpRecheck {
  checking: boolean;
  pullStartedAt: number | null;
}

interface Pull {
  startedAt: number;
  sawLoading: boolean;
  done: boolean;
}

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

  if (pull && !pull.done) {
    if (loading && !pull.sawLoading) setPull({ ...pull, sawLoading: true });
    else if (!loading && pull.sawLoading) setPull({ ...pull, done: true });
  }

  if (datesKey === null || !pull) return { checking: false, pullStartedAt: null };
  return { checking: !pull.done, pullStartedAt: pull.startedAt };
}
