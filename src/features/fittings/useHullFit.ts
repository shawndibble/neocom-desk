import { useEffect, useState } from 'react';
import type { CandidateCheck } from './dogmaFittingEngine';
import type { FittingContext } from './fittingContext';
import { getHullFit } from './hullFitService';

/**
 * Which fittable items go on this hull at all, and which the pilot can fly —
 * the module browser's whole-catalogue filter (mockup A: the browser shows
 * only what fits the open ship). The work is `hullFitService`'s — a Web
 * Worker, a saved answer per hull and skill set, one run shared by every
 * caller — so the Fittings route also calls this as a background warm-up
 * (`whenIdle`) as soon as the ship data, profile and catalogue are in,
 * before the pilot opens the module browser. Null until done, or while the
 * fitting context is (the ship data, pilot or catalogue still loading).
 */
export function useHullFit(
  context: FittingContext | null,
  shipTypeId: number | null,
  /** Start when the browser is idle (a background warm-up) rather than at once. */
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
          // A newer hull took the worker while this one was still on screen
          // (back-and-forth switching): ask again. Any other failure leaves
          // the browser on "checking" until the hull or pilot changes.
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
