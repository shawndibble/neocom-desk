import { useEffect, useState } from 'react';
import type { PilotProfile } from '@/engine/fittings/types';
import type { CandidateCheck } from './dogmaFittingEngine';
import { getHullFit } from './hullFitService';
import type { FittingCatalogue } from './useFittingCatalogue';

/**
 * Which fittable items go on this hull at all, and which the pilot can fly —
 * the module browser's whole-catalogue filter (mockup A: the browser shows
 * only what fits the open ship). The work is `hullFitService`'s — a Web
 * Worker, a saved answer per hull and skill set, one run shared by every
 * caller — so the Fittings route also calls this as a background warm-up
 * (`whenIdle`) as soon as the ship data, profile and catalogue are in,
 * before the pilot opens the module browser. Null until done, or while the
 * ship data isn't loaded.
 */
export function useHullFit(
  catalogue: FittingCatalogue | null,
  shipTypeId: number | null,
  profile: PilotProfile | null,
  engineReady: boolean,
  /** Start when the browser is idle (a background warm-up) rather than at once. */
  whenIdle = false
): ReadonlyMap<number, CandidateCheck> | null {
  const [result, setResult] = useState<{
    catalogue: FittingCatalogue;
    shipTypeId: number;
    profile: PilotProfile;
    checks: ReadonlyMap<number, CandidateCheck>;
  } | null>(null);

  useEffect(() => {
    if (catalogue === null || profile === null || shipTypeId === null || !engineReady) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = (attempt = 0) => {
      getHullFit(catalogue, shipTypeId, profile)
        .then((checks) => {
          if (!cancelled) setResult({ catalogue, shipTypeId, profile, checks });
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
  }, [catalogue, shipTypeId, profile, engineReady, whenIdle]);

  return result !== null &&
    result.catalogue === catalogue &&
    result.shipTypeId === shipTypeId &&
    result.profile === profile
    ? result.checks
    : null;
}
