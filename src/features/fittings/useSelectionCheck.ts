import { useEffect, useMemo, useState } from 'react';
import {
  applyImproveCandidate,
  overIskBudget,
  type ImproveOption,
  type RejectedOption,
} from '@/engine/fittings/improve';
import { mergeCandidates } from '@/engine/fittings/improve';
import { setKey } from '@/engine/fittings/improve';
import { summariseSelection } from '@/engine/fittings/improve';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import type { ImproveChoices } from './improveSettings';
import type { ImproveSearch } from './useImprove';
import { useCoverSearch } from './useCoverSearch';

interface Input {
  search: ImproveSearch;
  fitting: Fitting | null | undefined;
  target: TargetProfile | undefined;
  iskBudget: ImproveChoices['iskBudget'];
  chosen: ImproveOption[];
}

export function useSelectionCheck({ search, fitting, target, iskBudget, chosen }: Input) {
  const { state, recalc, completion } = search;
  const chosenKey = setKey(chosen);
  const [combined, setCombined] = useState<{
    key: string;
    fitting: Fitting;
    after: FittingStats | null;
  } | null>(null);
  useEffect(() => {
    if (!fitting || !recalc || chosen.length === 0) return;
    let stale = false;
    const folded = chosen.reduce(
      (acc, pick) => applyImproveCandidate(acc, pick.candidate),
      fitting
    );
    recalc(folded)
      .then((after) => !stale && setCombined({ key: chosenKey, fitting, after }))
      .catch(() => !stale && setCombined({ key: chosenKey, fitting, after: null }));
    return () => {
      stale = true;
    };
  }, [fitting, recalc, chosen, chosenKey]);
  const checkable = Boolean(fitting && recalc && state.status === 'done');
  const checked =
    combined?.key === chosenKey && combined.fitting === fitting ? combined.after : undefined;
  const summary =
    checkable && checked && state.status === 'done'
      ? summariseSelection({
          options: chosen,
          before: state.before,
          after: checked,
          iskBudget,
          fitTotal: state.fitTotal,
          target,
        })
      : null;
  const overruns = summary?.problems.some((problem) => problem.kind === 'over') ?? false;
  const covers = useCoverSearch({
    fitting,
    recalc,
    completion,
    checked,
    overruns,
    chosen,
    chosenKey,
  });
  const offered =
    covers?.key === chosenKey && summary
      ? covers.options.filter(
          (option) =>
            !overIskBudget(
              iskBudget,
              state.status === 'done' ? state.fitTotal : null,
              summary.isk + (option.iskDelta ?? 0)
            )
        )
      : null;
  const setAsFix = useMemo<RejectedOption | null>(() => {
    const candidate = mergeCandidates(chosen.map((pick) => pick.candidate));
    if (!fitting || !checked || !candidate || !summary || !overruns) return null;
    return {
      candidate,
      fitting: chosen.reduce((acc, pick) => applyImproveCandidate(acc, pick.candidate), fitting),
      after: checked,
      score: 0,
      iskDelta: summary.isk,
      lost: [],
      guardrail: 'budget',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitting, checked, chosenKey, overruns]);
  const canApply =
    chosen.length > 0 &&
    (!checkable || checked === null || (summary !== null && summary.problems.length === 0));

  return { checkable, checked, summary, overruns, covers, offered, setAsFix, canApply };
}

export type SelectionCheck = ReturnType<typeof useSelectionCheck>;
