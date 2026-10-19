/**
 * The skill levels that make the open, over-budget Fitting fit
 * (`findSkillFixes`), under the same evaluator What to train ranks with. One
 * run per evaluator, shared: Make it fit and What to train both ask, and the
 * second asker reads the first's answer. Stopped once no one waits on it.
 */
import { useEffect, useState } from 'react';
import { findSkillFixes, type SkillFix } from '@/engine/fittings/skillFixes';
import { skillGainCandidates } from '@/engine/fittings/skillGains';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

interface Run {
  promise: Promise<SkillFix[]>;
  /** Hooks waiting on it; the last to leave before it settles stops it. */
  subscribers: number;
  cancelled: boolean;
  settled: boolean;
}

const runs = new WeakMap<SkillGainEvaluator, Run>();

/**
 * Joins (or starts) the evaluator's run; the returned `leave` stops it once
 * nobody is waiting — every edit makes a new evaluator, and an abandoned
 * search of a superseded Fitting would otherwise run on to the end.
 */
function joinSkillFixes(evaluator: SkillGainEvaluator): {
  promise: Promise<SkillFix[]>;
  leave: () => void;
} {
  let run = runs.get(evaluator);
  if (!run) {
    const created: Run = {
      subscribers: 0,
      cancelled: false,
      settled: false,
      promise: (async () => {
        const [sources, { before }] = await Promise.all([
          evaluator.skillSources(),
          evaluator.compareTrained(evaluator.fitting, []),
        ]);
        return findSkillFixes({
          before,
          candidates: skillGainCandidates(sources, evaluator.profile.skillLevels),
          stats: async (trained) =>
            (await evaluator.compareTrained(evaluator.fitting, trained)).after,
          yieldFn: yieldToEventLoop,
          isCancelled: () => created.cancelled,
        });
      })(),
    };
    created.promise.then(
      () => (created.settled = true),
      () => runs.delete(evaluator)
    );
    runs.set(evaluator, created);
    run = created;
  }
  const joined = run;
  joined.subscribers++;
  return {
    promise: joined.promise,
    leave: () => {
      joined.subscribers--;
      if (joined.subscribers === 0 && !joined.settled) {
        // A stopped run's answer is partial: the next asker starts afresh.
        joined.cancelled = true;
        if (runs.get(evaluator) === joined) runs.delete(evaluator);
      }
    },
  };
}

export interface SkillFixesState {
  /** Null while working out, with no evaluator, or when not `enabled`. */
  fixes: SkillFix[] | null;
  failed: boolean;
}

export function useSkillFixes(
  evaluator: SkillGainEvaluator | null,
  enabled: boolean
): SkillFixesState {
  const [computed, setComputed] = useState<{
    evaluator: SkillGainEvaluator;
    fixes: SkillFix[] | null;
  } | null>(null);

  useEffect(() => {
    if (!evaluator || !enabled) return;
    let cancelled = false;
    const { promise, leave } = joinSkillFixes(evaluator);
    promise.then(
      (fixes) => !cancelled && setComputed({ evaluator, fixes }),
      () => !cancelled && setComputed({ evaluator, fixes: null })
    );
    return () => {
      cancelled = true;
      leave();
    };
  }, [evaluator, enabled]);

  const fresh = enabled && computed?.evaluator === evaluator ? computed : null;
  return { fixes: fresh?.fixes ?? null, failed: fresh !== null && fresh.fixes === null };
}
