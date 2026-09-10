import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';
import { CraftScopeChips, SweepStrategySelect } from './craftSweepShared';

interface BuildPlanCraftSweepControlProps {
  /** Nothing to sweep — Apply stays disabled (this plan's tree has no recipe at all). */
  maxDepth: number;
  /**
   * Production methods currently eligible to sweep (issue #698's
   * `craftScope`) — the same answer this plan's manual per-item toggle and
   * the recursive engine use, so this control can never promise more than a
   * sweep will actually apply.
   */
  scope: readonly MakeMethod[];
  /** Not ready to apply: live prices (cost-effective needs them) have not landed yet. */
  disabled?: boolean;
  onApply: (options: { strategy: SweepStrategy }) => void;
}

/**
 * The single-plan Craft Sweep control (docs/context/decisions, the
 * 20260909 sweep decision superseded for this surface). Unlike the Build
 * Group's `CraftSweepControl`, this one always sweeps this plan's whole
 * tree — there is no Sweep Depth choice — and applies on press with no
 * confirmation: a single plan's `buildHere` is cheap to hand-correct
 * afterward, and the overwrite-confirmation only earned its keep for a
 * Build Group's multi-plan blast radius. The Sweep Strategy select and
 * Craft Scope chips are the pieces genuinely shared with the group
 * control — `craftSweepShared.tsx`.
 *
 * Craft Scope's Reactions chip lights up exactly when `scope` includes it
 * (issue #698 — Include Reactions on, or the plan's own activity is a
 * reaction); Planetary stays reserved regardless.
 */
export function BuildPlanCraftSweepControl({
  maxDepth,
  scope,
  disabled,
  onApply,
}: BuildPlanCraftSweepControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<SweepStrategy>('cost-effective');

  return (
    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <span className="whitespace-nowrap">{t('industry.craftSweepStrategyLabel')}</span>
      <SweepStrategySelect strategy={strategy} onChange={setStrategy} />
      <CraftScopeChips scope={scope} />
      <Button size="sm" onClick={() => onApply({ strategy })} disabled={disabled || maxDepth === 0}>
        {t('industry.craftSweepApply')}
      </Button>
    </div>
  );
}
