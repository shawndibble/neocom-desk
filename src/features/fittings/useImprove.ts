import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchableGoal, type ImproveGoal } from '@/engine/fittings/improve';
import { mutatedKept, type MutatedKept } from '@/engine/fittings/improve';
import type { HullRef } from '@/engine/fittings/improve';
import type { ChargeLoadStep } from '@/engine/fittings/improve';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { createWorkerPool, searchPoolSize, type WorkerPool } from './fittingWorker';
import { fitCheckOf, modulePool } from './improveModulePool';
import {
  createImprovePorts,
  runImproveSearch,
  type ImproveOutcome,
  type ImproveRequest,
} from './improveSearch';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';

export function hullOf(
  fitting: Fitting | null | undefined,
  catalogue: FittingCatalogue | null
): HullRef | undefined {
  const groupId = fitting ? catalogue?.types[String(fitting.shipTypeId)]?.groupID : undefined;
  return fitting && groupId !== undefined ? { typeId: fitting.shipTypeId, groupId } : undefined;
}

export type ImproveConfig = ImproveRequest['config'];

type Done = Extract<ImproveOutcome, { status: 'done' }>;

export type CompletionPool = Awaited<ReturnType<Done['completion']>>;

export const BEST_SO_FAR_AFTER_MS = 10_000;

export type ImproveState =
  | { status: 'idle' }
  | {
      status: 'searching';
      checked: number;
      total: number;
      slow: boolean;
      makeover?: boolean;
    }
  | { status: 'cancelled' }
  | { status: 'failed' }
  | Exclude<ImproveOutcome, Done>
  | Omit<Done, 'recalc' | 'completion'>;

export interface ImproveSearch {
  goal: ImproveGoal;
  hull?: HullRef;
  state: ImproveState;
  before: FittingStats | null;
  cancel: () => void;
  showBestSoFar: () => void;
  restart: () => void;
  recalc: Done['recalc'] | null;
  completion: Done['completion'] | null;
  mutatedKept: MutatedKept;
}

const NO_CHARGES: readonly ChargeLoadStep[] = [];

export function useImprove(
  variants: VariantEvaluator | null,
  catalogue: FittingCatalogue | null,
  goal: ImproveGoal,
  target: TargetProfile | undefined,
  enabled: boolean,
  config: ImproveConfig,
  chargePlan: readonly ChargeLoadStep[] = NO_CHARGES
): ImproveSearch {
  const { hubId } = useHubFor('fittings');
  const percent = usePricePercentFor('fittings');
  const chargePlanKey = JSON.stringify(chargePlan);
  const configKey = JSON.stringify(config);
  const [state, setState] = useState<ImproveState>({ status: 'idle' });
  const [before, setBefore] = useState<FittingStats | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelRef = useRef<() => void>(() => {});
  const stopRef = useRef(false);
  const poolRef = useRef<WorkerPool | null>(null);
  const [recalc, setRecalc] = useState<ImproveSearch['recalc']>(null);
  const [completion, setCompletion] = useState<ImproveSearch['completion']>(null);
  const hullKey = JSON.stringify(hullOf(variants?.fitting, catalogue) ?? null);
  const hull = useMemo(() => (JSON.parse(hullKey) as HullRef | null) ?? undefined, [hullKey]);

  const closePool = useCallback(() => {
    poolRef.current?.close();
    poolRef.current = null;
  }, []);
  useEffect(() => {
    if (!enabled) closePool();
  }, [enabled, closePool]);
  useEffect(() => closePool, [closePool]);

  useEffect(() => {
    if (!enabled || !variants || !catalogue) return;
    const controller = new AbortController();
    const { signal } = controller;
    stopRef.current = false;
    cancelRef.current = () => {
      controller.abort();
      setState({ status: 'cancelled' });
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new search starts from nothing
    setState({ status: 'searching', checked: 0, total: 0, slow: false });
    setBefore(null);
    setRecalc(null);
    setCompletion(null);
    const searching = (
      update: (s: Extract<ImproveState, { status: 'searching' }>) => ImproveState
    ) => setState((current) => (current.status === 'searching' ? update(current) : current));
    const slowTimer = setTimeout(() => {
      if (!signal.aborted) searching((current) => ({ ...current, slow: true }));
    }, BEST_SO_FAR_AFTER_MS);
    const request: ImproveRequest = {
      catalogue,
      goal,
      hull,
      target,
      chargePlan: JSON.parse(chargePlanKey) as ChargeLoadStep[],
      config: JSON.parse(configKey) as ImproveConfig,
    };
    const ports = createImprovePorts({
      variants,
      catalogue,
      hubId,
      percent,
      workers: () => (poolRef.current ??= createWorkerPool(searchPoolSize())),
    });
    runImproveSearch(request, ports, {
      signal,
      onBaseline: setBefore,
      onProgress: (progress) => searching((current) => ({ ...current, ...progress })),
      shouldStop: () => stopRef.current,
    }).then(
      (outcome) => {
        if (!outcome || signal.aborted) return;
        if (outcome.status !== 'done') return setState(outcome);
        const { recalc: recalcOf, completion: completionOf, ...done } = outcome;
        setRecalc(() => recalcOf);
        setCompletion(() => completionOf);
        setState(done);
      },
      () => {
        if (!signal.aborted) setState({ status: 'failed' });
      }
    );
    return () => {
      controller.abort();
      setRecalc(null);
      setCompletion(null);
      clearTimeout(slowTimer);
    };
  }, [
    enabled,
    variants,
    catalogue,
    goal,
    hull,
    target,
    hubId,
    percent,
    attempt,
    configKey,
    chargePlanKey,
  ]);

  const cancel = useCallback(() => cancelRef.current(), []);
  const showBestSoFar = useCallback(() => {
    stopRef.current = true;
  }, []);
  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  const { allowMutated } = config;
  const kept = useMemo(() => {
    const modules = variants?.fitting.modules ?? [];
    const pool =
      catalogue && variants && modules.some((m) => m.mutation)
        ? modulePool(catalogue, fitCheckOf(variants))
        : null;
    return mutatedKept(
      modules,
      allowMutated,
      pool?.pilotCanFly ? (module) => pool.pilotCanFly!(module.slot, module.typeId) : undefined
    );
  }, [variants, catalogue, allowMutated]);

  return {
    goal: before ? searchableGoal(goal, before, hull) : goal,
    hull,
    state: enabled ? state : { status: 'idle' },
    before: enabled ? before : null,
    cancel,
    showBestSoFar,
    restart,
    recalc: enabled ? recalc : null,
    completion: enabled ? completion : null,
    mutatedKept: kept,
  };
}
