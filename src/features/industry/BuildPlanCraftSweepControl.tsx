import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import { CraftScopeChips, SweepStrategySelect } from './craftSweepShared';

interface BuildPlanCraftSweepControlProps {
  /** Nothing to sweep — Apply stays disabled (this plan's tree has no recipe at all). */
  maxDepth: number;
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
 * Craft Scope is fixed to Manufacturing — the only production method the
 * underlying walk actually marks buildable (`resolveMaterial` ignores a
 * `buildHere` entry for a reaction or planetary material); Planetary stays
 * visible as a reserved slot, Reactions is not shown here at all.
 */
export function BuildPlanCraftSweepControl({
  maxDepth,
  disabled,
  onApply,
}: BuildPlanCraftSweepControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<SweepStrategy>('cost-effective');

  return (
    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <span className="whitespace-nowrap">{t('industry.craftSweepStrategyLabel')}</span>
      <SweepStrategySelect strategy={strategy} onChange={setStrategy} />
      <CraftScopeChips reserved={['planetary']} />
      <Button size="sm" onClick={() => onApply({ strategy })} disabled={disabled || maxDepth === 0}>
        {t('industry.craftSweepApply')}
      </Button>
    </div>
  );
}
