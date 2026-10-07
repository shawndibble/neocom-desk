/**
 * The whole-account plan, worked out off the main render. One plan is dozens of
 * solver searches, so the engine's generator runs in short slices between
 * frames (`SLICE_MS`) and the answer is kept for the last set of inputs: leaving
 * Find best and coming back does not plan again.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PiData } from '@/sde/types';
import { planAccount, type AccountPlan } from '@/engine/pi/accountPlan';
import type { PiTier } from '@/engine/pi/types';
import { accountCandidates } from './accountPlanModel';
import { chainPricing } from './chainEstimateModel';
import { chainBasisKey } from './useChainEstimates';
import { plannerPolicy } from './goalPlannerModel';
import type { PlanAdvice } from './planAdviceModel';
import { SLICE_MS } from './runSliced';
import { coloniesKey, useChainInputs } from './useBiggerChains';

export interface AccountPlanState {
  plan: AccountPlan | null;
  /** The planner threw: no plan will come for these inputs. */
  failed: boolean;
  /** Still planning (or still counting jumps). */
  pending: boolean;
}

let cached: { key: string; plan: AccountPlan | null } | null = null;

/** Test seam: forget the last plan. */
export function resetAccountPlan(): void {
  cached = null;
}

export function useAccountPlan(
  advice: PlanAdvice,
  pi: PiData,
  options: { haul: boolean; buyTiers: readonly PiTier[] }
): AccountPlanState {
  const { haul, buyTiers } = options;
  const { colonies, jumps, key: inputsKey } = useChainInputs(advice, pi, haul);
  const { books, policy } = useMemo(() => {
    const pricing = chainPricing(advice.chainBasis);
    return { books: pricing.books, policy: plannerPolicy({ maxP0Types: 2, buyTiers }) };
  }, [advice.chainBasis, buyTiers]);
  const soloPerDay = useMemo(
    () => new Map(advice.colonies.map((c) => [c.planetId, c.afterRebuildPerDay])),
    [advice.colonies]
  );
  const candidates = useMemo(
    () =>
      accountCandidates(colonies, pi, advice.chainBasis.books.revenuePrices, buyTiers.length > 0),
    [colonies, pi, advice.chainBasis, buyTiers]
  );
  // The colonies and assumptions the solver reads, and the SDE it reads them from. Without
  // hauling there are no distances to wait for, so the jump key is left out.
  const key = useMemo(() => {
    if (haul && inputsKey === null) return null;
    return JSON.stringify([
      chainBasisKey(advice.chainBasis, pi),
      coloniesKey(colonies),
      haul ? inputsKey : null,
      haul,
      buyTiers,
      candidates,
      [...soloPerDay],
    ]);
  }, [haul, inputsKey, advice.chainBasis, pi, buyTiers, candidates, soloPerDay, colonies]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (key === null || cached?.key === key) return;
    const steps = planAccount({
      colonies,
      policy,
      books,
      candidates,
      haul,
      soloPerDay,
      pi,
      ...(jumps ? { jumps } : {}),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slice = () => {
      const start = performance.now();
      try {
        while (performance.now() - start < SLICE_MS) {
          const next = steps.next();
          if (next.done) {
            cached = { key, plan: next.value };
            setVersion((v) => v + 1);
            return;
          }
        }
      } catch {
        cached = { key, plan: null };
        setVersion((v) => v + 1);
        return;
      }
      timer = setTimeout(slice, 0);
    };
    timer = setTimeout(slice, 0);
    return () => clearTimeout(timer);
    // `key` stands for the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    void version;
    const done = key !== null && cached?.key === key ? cached : null;
    return {
      plan: done?.plan ?? null,
      failed: done !== null && done.plan === null,
      pending: done === null,
    };
  }, [key, version]);
}
