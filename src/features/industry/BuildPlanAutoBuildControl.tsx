import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';
import { CraftScopeChips, BuildStrategySelect } from './autoBuildShared';

interface BuildPlanAutoBuildControlProps {
  /** Nothing to auto-build — the select stays disabled (this plan's tree has no recipe at all). */
  maxDepth: number;
  /**
   * Production methods currently eligible to auto-build (issue #698's
   * `craftScope`) — the same answer this plan's manual per-item toggle and
   * the recursive engine use, so this control can never promise more than an
   * Auto Build pass will actually apply.
   */
  scope: readonly MakeMethod[];
  /** Not ready to apply: live prices (cost-effective needs them) have not landed yet. */
  disabled?: boolean;
  onApply: (options: { strategy: BuildStrategy }) => void;
}

/**
 * The single-plan Auto Build control (docs/context/decisions, the
 * 20260909 and 20260910-082156 decisions superseded for this surface, issue
 * #778). Unlike the Build Group's `AutoBuildControl`, this one always
 * auto-builds this plan's whole tree — there is no depth choice — and
 * applies with no confirmation: a single plan's `buildHere` is cheap to
 * hand-correct afterward, and the overwrite-confirmation only earned its
 * keep for a Build Group's multi-plan blast radius.
 *
 * Changing Build Strategy is the only way to apply here (issue #798 dropped
 * the icon-only re-run button this surface used to carry beside it): a
 * single plan already recomputes live as its own fields change, so a
 * separate "apply again" affordance was never covering anything a field
 * edit didn't already trigger — see the decision file for the one real gap
 * this leaves (reselecting the strategy already shown fires no change
 * event, so re-running the same strategy after a hand-edited `buildHere`
 * has no dedicated control; pick a different strategy and back instead).
 * The Build Strategy select and Craft Scope chips are the pieces genuinely
 * shared with the group control — `autoBuildShared.tsx`.
 *
 * Craft Scope's Reactions chip lights up exactly when `scope` includes it
 * (issue #698 — Include Reactions on, or the plan's own activity is a
 * reaction). Manufacturing and Planetary are never shown as chips at all —
 * every Auto Build pass always includes Manufacturing, and Planetary is not
 * yet an auto-build-eligible method on any surface.
 */
export function BuildPlanAutoBuildControl({
  maxDepth,
  scope,
  disabled,
  onApply,
}: BuildPlanAutoBuildControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<BuildStrategy>('cost-effective');
  const canApply = !disabled && maxDepth > 0;

  function handleStrategyChange(next: BuildStrategy) {
    setStrategy(next);
    if (canApply) onApply({ strategy: next });
  }

  return (
    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <span className="whitespace-nowrap">{t('industry.buildStrategyLabel')}</span>
      <BuildStrategySelect
        strategy={strategy}
        onChange={handleStrategyChange}
        size="sm"
        disabled={!canApply}
      />
      <CraftScopeChips scope={scope} />
    </div>
  );
}
