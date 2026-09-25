import { useEffect, useState } from 'react';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { PilotProfile } from '@/engine/fittings/types';
import { checkCandidates, type CandidateCheck } from './dogmaFittingEngine';
import type { FittingCatalogue } from './useFittingCatalogue';

/** Ids per engine call; small enough that one slice stays well under a frame. */
const BATCH = 50;
/** How long one slice may run before yielding to the page. */
const SLICE_MS = 12;

/**
 * Which fittable items go on this hull at all, and which the pilot can fly —
 * the module browser's whole-catalogue filter (mockup A: the browser shows
 * only what fits the open ship). Every fittable market item is checked once
 * per hull and pilot, in slices that yield between them so the page stays
 * responsive (~0.3 ms an item, a few thousand items); `checkCandidates`
 * memoizes, so a return to the same hull is instant. Null until done, or
 * while the ship data isn't loaded.
 */
export function useHullFit(
  catalogue: FittingCatalogue | null,
  shipTypeId: number,
  profile: PilotProfile | null,
  engineReady: boolean
): ReadonlyMap<number, CandidateCheck> | null {
  const [result, setResult] = useState<{
    catalogue: FittingCatalogue;
    shipTypeId: number;
    profile: PilotProfile;
    checks: ReadonlyMap<number, CandidateCheck>;
  } | null>(null);

  useEffect(() => {
    if (catalogue === null || profile === null || !engineReady) return;
    const byRack = new Map<CandidateRack, number[]>();
    for (const entry of catalogue.marketTypes) {
      const rack = catalogue.rackOf[String(entry.typeId)];
      if (rack === undefined) continue;
      const ids = byRack.get(rack) ?? [];
      ids.push(entry.typeId);
      byRack.set(rack, ids);
    }
    const jobs: [CandidateRack, number[]][] = [];
    for (const [rack, ids] of byRack) {
      for (let i = 0; i < ids.length; i += BATCH) jobs.push([rack, ids.slice(i, i + BATCH)]);
    }

    const checks = new Map<number, CandidateCheck>();
    let next = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const slice = () => {
      if (cancelled) return;
      const until = performance.now() + SLICE_MS;
      while (next < jobs.length && performance.now() < until) {
        const [rack, ids] = jobs[next++];
        for (const [id, check] of checkCandidates(shipTypeId, rack, ids, profile)) {
          checks.set(id, check);
        }
      }
      if (next < jobs.length) timer = setTimeout(slice, 0);
      else setResult({ catalogue, shipTypeId, profile, checks });
    };
    timer = setTimeout(slice, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [catalogue, shipTypeId, profile, engineReady]);

  return result !== null &&
    result.catalogue === catalogue &&
    result.shipTypeId === shipTypeId &&
    result.profile === profile
    ? result.checks
    : null;
}
