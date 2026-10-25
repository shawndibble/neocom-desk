/**
 * Improve for the open Fitting (`findImprovements`): every fitted module's
 * variations the hull takes and the pilot can fly, recalculated whole under
 * the same evaluator the page's stats come from (Damage Profile, Overheat
 * all, implant basis), scored against the page's Target Profile and priced
 * at the pilot's Trade Hub. Runs only while `enabled`, so a closed drawer
 * costs nothing; Cancel aborts the calculation in the worker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findImprovements,
  improveCandidates,
  type ImproveCandidate,
  type ImproveGoal,
  type ImproveResult,
} from '@/engine/fittings/improve';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { FittingStats } from '@/engine/fittings/types';
import { buildVariationIndex } from '@/engine/market/variations';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';
import { COMBAT_GOALS } from '@/engine/fittings/improve';

/** The last Improve Goal, remembered on this device like other Fittings preferences. */
export const useImproveGoal = createLocalSetting<ImproveGoal>({
  key: 'fittingsImproveGoal',
  defaultValue: 'overall',
  parse: (raw) =>
    typeof raw === 'string' && (COMBAT_GOALS as readonly string[]).includes(raw)
      ? (raw as ImproveGoal)
      : 'overall',
});

/** After this long a search offers "Show best so far". */
export const BEST_SO_FAR_AFTER_MS = 10_000;

export type ImproveState =
  | { status: 'idle' }
  | { status: 'searching'; checked: number; total: number; slow: boolean }
  | { status: 'cancelled' }
  | { status: 'failed' }
  | { status: 'done'; result: ImproveResult; before: FittingStats; elapsedMs: number };

export interface ImproveSearch {
  state: ImproveState;
  /** The open Fitting's stats before any swap, for each row's goal check; null until known. */
  before: FittingStats | null;
  cancel: () => void;
  showBestSoFar: () => void;
  /** Runs the search again after a Cancel. */
  restart: () => void;
}

/** Candidates the hull takes and the pilot can fly: one the pilot lacks skills for goes under Train instead. */
function flyableCandidates(
  variants: VariantEvaluator,
  catalogue: FittingCatalogue
): ImproveCandidate[] {
  const index = buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups);
  const all = improveCandidates(variants.fitting.modules, index, catalogue.rackOf);
  const bySlot = new Map<ImproveCandidate['at'][number]['slot'], number[]>();
  for (const candidate of all) {
    const slot = candidate.at[0].slot;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), candidate.toTypeId]);
  }
  const checks = new Map(
    [...bySlot].map(([slot, typeIds]) => [
      slot,
      variants.engine.checkCandidates(variants.fitting.shipTypeId, slot, typeIds, variants.profile),
    ])
  );
  return all.filter((candidate) => {
    const check = checks.get(candidate.at[0].slot)?.get(candidate.toTypeId);
    return check ? check.fitsHull && check.canFly : true;
  });
}

export function useImprove(
  variants: VariantEvaluator | null,
  catalogue: FittingCatalogue | null,
  goal: ImproveGoal,
  target: TargetProfile | undefined,
  enabled: boolean
): ImproveSearch {
  const hubId = useMarketHub((state) => state.value);
  const [state, setState] = useState<ImproveState>({ status: 'idle' });
  const [before, setBefore] = useState<FittingStats | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelRef = useRef<() => void>(() => {});
  const stopRef = useRef(false);

  const candidates = useMemo(
    () => (enabled && variants && catalogue ? flyableCandidates(variants, catalogue) : []),
    [enabled, variants, catalogue]
  );

  useEffect(() => {
    if (!enabled || !variants) return;
    let cancelled = false;
    const controller = new AbortController();
    stopRef.current = false;
    cancelRef.current = () => {
      cancelled = true;
      controller.abort();
      setState({ status: 'cancelled' });
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new search starts from nothing
    setState({ status: 'searching', checked: 0, total: candidates.length, slow: false });
    const started = performance.now();
    const slowTimer = setTimeout(() => {
      if (!cancelled)
        setState((current) =>
          current.status === 'searching' ? { ...current, slow: true } : current
        );
    }, BEST_SO_FAR_AFTER_MS);
    void (async () => {
      const typeIds = [...new Set(candidates.flatMap((c) => [c.fromTypeId, c.toTypeId]))];
      const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
      const priceMap = await getHubPrices(hub, typeIds).catch(() => null);
      if (cancelled) return;
      try {
        const { before: own } = await variants.compare(variants.fitting, controller.signal);
        if (cancelled) return;
        setBefore(own);
        const result = await findImprovements({
          fitting: variants.fitting,
          before: own,
          goal,
          candidates,
          stats: async (fitting) => (await variants.compare(fitting, controller.signal)).after,
          priceOf: (typeId) => priceMap?.get(typeId)?.sellMin ?? null,
          ...(target ? { target } : {}),
          onProgress: (checked, total) => {
            if (!cancelled)
              setState((current) =>
                current.status === 'searching' ? { ...current, checked, total } : current
              );
          },
          isCancelled: () => cancelled,
          shouldStop: () => stopRef.current,
        });
        if (cancelled || result === null) return;
        setState({ status: 'done', result, before: own, elapsedMs: performance.now() - started });
      } catch {
        if (!cancelled) setState({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(slowTimer);
    };
  }, [enabled, variants, candidates, goal, target, hubId, attempt]);

  const cancel = useCallback(() => cancelRef.current(), []);
  const showBestSoFar = useCallback(() => {
    stopRef.current = true;
  }, []);
  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    state: enabled ? state : { status: 'idle' },
    before: enabled ? before : null,
    cancel,
    showBestSoFar,
    restart,
  };
}
