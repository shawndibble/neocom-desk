import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';

interface BuildPlanCraftSweepControlProps {
  /** Nothing to sweep — Apply stays disabled (this plan's tree has no recipe at all). */
  maxDepth: number;
  /** Not ready to apply: live prices (cost-effective needs them) have not landed yet. */
  disabled?: boolean;
  onApply: (options: { strategy: SweepStrategy }) => void;
}

const SWEEP_STRATEGIES: readonly SweepStrategy[] = ['cost-effective', 'build', 'buy'];

/**
 * The single-plan Craft Sweep control (docs/context/decisions, the
 * 20260909 sweep decision superseded for this surface). Unlike the Build
 * Group's `CraftSweepControl`, this one always sweeps this plan's whole
 * tree — there is no Sweep Depth choice — and applies on press with no
 * confirmation: a single plan's `buildHere` is cheap to hand-correct
 * afterward, and the overwrite-confirmation only earned its keep for a
 * Build Group's multi-plan blast radius.
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

  const strategyLabel: Record<SweepStrategy, string> = {
    'cost-effective': t('industry.craftSweepStrategyCostEffective'),
    build: t('industry.craftSweepStrategyBuild'),
    buy: t('industry.craftSweepStrategyBuy'),
  };

  return (
    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <span className="whitespace-nowrap">{t('industry.craftSweepStrategyLabel')}</span>
      <Select value={strategy} onValueChange={(value) => setStrategy(value as SweepStrategy)}>
        <SelectTrigger aria-label={t('industry.craftSweepStrategyLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SWEEP_STRATEGIES.map((option) => (
            <SelectItem key={option} value={option}>
              {strategyLabel[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="flex items-center gap-1">
        <span className="rounded-xs border border-accent-dim bg-accent/15 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
          {t('industry.craftScopeManufacturing')}
        </span>
        <span
          aria-disabled="true"
          title={t('industry.craftScopeReserved')}
          className="rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase opacity-60"
        >
          {t('industry.craftScopePlanetary')}
        </span>
      </span>
      <Button size="sm" onClick={() => onApply({ strategy })} disabled={disabled || maxDepth === 0}>
        {t('industry.craftSweepApply')}
      </Button>
    </div>
  );
}
