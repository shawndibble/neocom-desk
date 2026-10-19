/**
 * The skill levels that make the open, over-budget Fitting fit
 * (`findSkillFixes`), under the same evaluator What to train ranks with. One
 * run per evaluator, shared: Make it fit and What to train both ask, and the
 * second asker reads the first's answer.
 */
import { useEffect, useState } from 'react';
import { findSkillFixes, type SkillFix } from '@/engine/fittings/skillFixes';
import { skillGainCandidates } from '@/engine/fittings/skillGains';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

const runs = new WeakMap<SkillGainEvaluator, Promise<SkillFix[]>>();

function skillFixesFor(evaluator: SkillGainEvaluator): Promise<SkillFix[]> {
  let run = runs.get(evaluator);
  if (!run) {
    run = (async () => {
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
      });
    })();
    runs.set(evaluator, run);
    run.catch(() => runs.delete(evaluator));
  }
  return run;
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
    skillFixesFor(evaluator).then(
      (fixes) => !cancelled && setComputed({ evaluator, fixes }),
      () => !cancelled && setComputed({ evaluator, fixes: null })
    );
    return () => {
      cancelled = true;
    };
  }, [evaluator, enabled]);

  const fresh = enabled && computed?.evaluator === evaluator ? computed : null;
  return { fixes: fresh?.fixes ?? null, failed: fresh !== null && fresh.fixes === null };
}
