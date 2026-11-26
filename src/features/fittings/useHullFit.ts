import { useEffect, useState } from 'react';
import type { CandidateCheck } from './dogmaFittingEngine';
import type { FittingContext } from './fittingContext';
import { getHullFit } from './hullFitService';

export function useHullFit(
  context: FittingContext | null,
  shipTypeId: number | null,
  whenIdle = false
): ReadonlyMap<number, CandidateCheck> | null {
  const [result, setResult] = useState<{
    context: FittingContext;
    shipTypeId: number;
    checks: ReadonlyMap<number, CandidateCheck>;
  } | null>(null);

  useEffect(() => {
    if (context === null || shipTypeId === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = (attempt = 0) => {
      getHullFit(context, shipTypeId)
        .then((checks) => {
          if (!cancelled) setResult({ context, shipTypeId, checks });
        })
        .catch((error: unknown) => {
          if (
            !cancelled &&
            attempt < 3 &&
            error instanceof Error &&
            error.message === 'superseded'
          ) {
            timer = setTimeout(() => start(attempt + 1), 0);
          }
        });
    };
    let idle: number | undefined;
    if (whenIdle && typeof requestIdleCallback === 'function') {
      idle = requestIdleCallback(() => start(), { timeout: 2000 });
    } else {
      timer = setTimeout(() => start(), 0);
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, [context, shipTypeId, whenIdle]);

  return result !== null && result.context === context && result.shipTypeId === shipTypeId
    ? result.checks
    : null;
}
