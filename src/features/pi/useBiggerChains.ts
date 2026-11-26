import { idSetKey } from '@/lib/idSetKey';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JumpsFn, PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import type { PiData } from '@/sde/types';
import { jumpsBetween, useSharedJumpBasis } from '@/features/route/jumpBasis';
import {
  biggerChainCandidates,
  estimateOnColonies,
  estimateOnColoniesWith,
  estimateOnNewPlanets,
  estimateOnNewPlanetsWith,
  whatIfChainCandidates,
  whatIfKey,
  whatIfTypesOf,
  type BiggerChainEstimates,
} from './biggerChainsModel';
import { chainBasisKey } from './useChainEstimates';
import type { PlanAdvice } from './planAdviceModel';
import { runSliced } from './runSliced';

export interface BiggerChainsEstimateState {
  estimates: ReadonlyMap<number, BiggerChainEstimates>;
  candidateCount: number;
  pending: boolean;
}

let cached: { key: string; results: Map<number, BiggerChainEstimates> } | null = null;
const whatIfCache = new Map<string, Map<string, Map<number, BiggerChainEstimates>>>();
const WHAT_IF_CACHE_SIZE = 4;

function whatIfResultsFor(key: string): Map<string, Map<number, BiggerChainEstimates>> {
  let byType = whatIfCache.get(key);
  if (!byType) {
    byType = new Map();
    whatIfCache.set(key, byType);
    while (whatIfCache.size > WHAT_IF_CACHE_SIZE) {
      whatIfCache.delete(whatIfCache.keys().next().value!);
    }
  }
  return byType;
}
let cachedPairs: { key: string; byPair: Map<string, number | null> } | null = null;

export function resetBiggerChains(): void {
  cached = null;
  whatIfCache.clear();
  cachedPairs = null;
}

export function coloniesKey(colonies: readonly PlannerColony[]): string {
  return JSON.stringify(
    colonies.map((c) => [
      c.planetId,
      c.planetType,
      c.budget,
      c.newLinkCost,
      c.headsPerExtractor,
      c.taxRate,
      [...c.ratePerEcu].map(([id, rate]) => [id, rate.unitsPerHour, rate.source]),
      c.current.p0TypeIds,
      c.current.productTypeIds,
      c.current.ecusByP0 ? [...c.current.ecusByP0] : null,
    ])
  );
}

function useColonyJumps(
  systemOf: ReadonlyMap<number, number>,
  enabled: boolean
): {
  fn: JumpsFn | undefined;
  key: string | null;
} {
  const basis = useSharedJumpBasis();
  const systemKey = idSetKey(systemOf.values());
  const wanted = `${basis.key}|${systemKey}`;
  const counted = cachedPairs?.key === wanted;
  const count = useCallback(async () => {
    const ids = systemKey === '' ? [] : systemKey.split(',').map(Number);
    const pairIds = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const));
    const between = await Promise.all(
      pairIds.map(([a, b]) =>
        jumpsBetween(a, b, basis)
          .then((r) => (r.kind === 'known' ? r.jumps : null))
          .catch(() => null)
      )
    );
    cachedPairs = {
      key: wanted,
      byPair: new Map(pairIds.map(([a, b], i) => [`${a}-${b}`, between[i]])),
    };
    return cachedPairs;
  }, [basis, systemKey, wanted]);
  const { data: loaded } = useKeyedLoad(wanted, count, !enabled || !basis.hydrated || counted);
  const pairs = counted ? cachedPairs : loaded;

  return useMemo(() => {
    if (!enabled || !pairs || pairs.key !== wanted) return { fn: undefined, key: null };
    const fn: JumpsFn = (from, to) => {
      if (to === 'hub') return null;
      const a = systemOf.get(from);
      const b = systemOf.get(to);
      if (a === undefined || b === undefined) return null;
      if (a === b) return 0;
      return pairs.byPair.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? null;
    };
    return { fn, key: wanted };
  }, [pairs, wanted, systemOf, enabled]);
}

export interface ChainInputs {
  colonies: readonly PlannerColony[];
  types: PlanetType[];
  free: number;
  jumps: JumpsFn | undefined;
  key: string | null;
}

export function useChainInputs(
  advice: PlanAdvice,
  pi: PiData | null,
  enabled: boolean
): ChainInputs {
  const colonies = advice.chainColonies;
  const systemOf = useMemo(
    () => new Map(advice.colonies.map((colony) => [colony.planetId, colony.systemId])),
    [advice.colonies]
  );
  const jumps = useColonyJumps(systemOf, enabled);
  const types = useMemo(
    () => [...new Set(colonies.map((colony) => colony.planetType))].sort(),
    [colonies]
  );
  const free = advice.slots.free;
  const basisKey = useMemo(
    () => (enabled && pi ? chainBasisKey(advice.chainBasis, pi) : null),
    [enabled, advice.chainBasis, pi]
  );
  const colonyKey = useMemo(() => (enabled ? coloniesKey(colonies) : null), [enabled, colonies]);
  const key =
    jumps.key === null || basisKey === null
      ? null
      : JSON.stringify([basisKey, colonyKey, jumps.key, types, free]);
  return { colonies, types, free, jumps: jumps.fn, key };
}

export function useBiggerChains(advice: PlanAdvice, pi: PiData): BiggerChainsEstimateState {
  const { colonies, types, free, jumps, key } = useChainInputs(advice, pi, true);
  const candidates = useMemo(() => biggerChainCandidates(colonies, pi), [colonies, pi]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (key === null) return;
    if (cached?.key !== key) cached = { key, results: new Map() };
    const results = cached.results;
    const todo = candidates
      .filter((typeId) => !results.has(typeId))
      .flatMap((typeId) => [
        { typeId, layout: 'new' as const },
        { typeId, layout: 'colonies' as const },
      ]);
    if (todo.length === 0) return;
    const partial = new Map<number, BiggerChainEstimates>();
    return runSliced(
      todo,
      ({ typeId, layout }) => {
        const entry = partial.get(typeId) ?? { colonies: null, newPlanets: null };
        if (layout === 'new') {
          entry.newPlanets = estimateOnNewPlanets(typeId, types, free, advice.chainBasis, pi);
          partial.set(typeId, entry);
        } else {
          entry.colonies = estimateOnColonies(typeId, colonies, advice.chainBasis, jumps, pi);
          partial.delete(typeId);
          results.set(typeId, entry);
        }
      },
      () => setVersion((v) => v + 1)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    void version;
    const results = key !== null && cached?.key === key ? cached.results : null;
    const estimates = new Map(
      candidates.flatMap((typeId) => {
        const entry = results?.get(typeId);
        return entry ? [[typeId, entry] as const] : [];
      })
    );
    return {
      estimates,
      candidateCount: candidates.length,
      pending: key === null || estimates.size < candidates.length,
    };
  }, [key, version, candidates]);
}

export interface WhatIfChainsState {
  byType: ReadonlyMap<string, ReadonlyMap<number, BiggerChainEstimates>>;
  pending: boolean;
}

export const NO_WHAT_IF_CHAINS: WhatIfChainsState = { byType: new Map(), pending: false };

type WhatIfUnit =
  { key: string; typeId: number; layout: 'new' | 'colonies' } | { key: string; layout: 'done' };

export type WhatIfAsk = PlanetType | readonly PlanetType[];

export const NO_TYPES: readonly PlanetType[] = [];

export function useWhatIfChains(
  advice: PlanAdvice,
  pi: PiData | null,
  wanted: readonly WhatIfAsk[] = NO_TYPES
): WhatIfChainsState {
  const enabled = wanted.length > 0 && pi !== null;
  const { colonies, types, free, jumps, key } = useChainInputs(advice, pi, enabled);
  const wantedKey = wanted.map(whatIfKey).join(',');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (key === null || !pi) return;
    const byType = whatIfResultsFor(key);
    const todo: WhatIfUnit[] = wantedKey
      .split(',')
      .filter((asked) => asked !== '' && !byType.has(asked))
      .flatMap((asked) => [
        ...whatIfChainCandidates(colonies, whatIfTypesOf(asked), pi).flatMap((typeId) => [
          { key: asked, typeId, layout: 'new' as const },
          { key: asked, typeId, layout: 'colonies' as const },
        ]),
        { key: asked, layout: 'done' as const },
      ]);
    if (todo.length === 0) return;
    const partial = new Map<string, Map<number, BiggerChainEstimates>>();
    return runSliced(
      todo,
      (unit) => {
        const chains = partial.get(unit.key) ?? new Map<number, BiggerChainEstimates>();
        partial.set(unit.key, chains);
        if (unit.layout === 'done') {
          byType.set(unit.key, chains);
          if (whatIfCache.get(key) !== byType) whatIfCache.set(key, byType);
          return true;
        }
        const entry = chains.get(unit.typeId) ?? { colonies: null, newPlanets: null };
        const added = whatIfTypesOf(unit.key);
        if (unit.layout === 'new') {
          entry.newPlanets = estimateOnNewPlanetsWith(
            unit.typeId,
            added,
            types,
            free,
            advice.chainBasis,
            pi
          );
        } else {
          entry.colonies = estimateOnColoniesWith(
            unit.typeId,
            added,
            colonies,
            free,
            advice.chainBasis,
            jumps,
            pi
          );
        }
        chains.set(unit.typeId, entry);
        return false;
      },
      (landed) => {
        if (landed) setVersion((v) => v + 1);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wantedKey]);

  return useMemo(() => {
    void version;
    const results = key !== null ? whatIfCache.get(key) : undefined;
    const asked = wantedKey === '' ? [] : wantedKey.split(',');
    const byType = new Map(
      asked.flatMap((ask) => {
        const chains = results?.get(ask);
        return chains ? [[ask, chains] as const] : [];
      })
    );
    return { byType, pending: enabled && byType.size < asked.length };
  }, [key, version, wantedKey, enabled]);
}
