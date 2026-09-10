import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ControlSize,
} from '@/components/ui';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';

/**
 * Pieces the Build Group's `CraftSweepControl` and the single-plan
 * `BuildPlanCraftSweepControl` both compose unchanged: the same three Sweep
 * Strategy choices and the same Craft Scope chip look. Kept in one place so
 * a future label or style tweak lands once rather than being hand-kept in
 * sync across both files. Each control's own shape around these pieces —
 * header/tooltip, Sweep Depth, confirmation — stays genuinely separate; only
 * what was actually identical between them moved here.
 */

const SWEEP_STRATEGIES: readonly SweepStrategy[] = ['cost-effective', 'build', 'buy'];

function useSweepStrategyLabels(): Record<SweepStrategy, string> {
  const { t } = useTranslation();
  return {
    'cost-effective': t('industry.craftSweepStrategyCostEffective'),
    build: t('industry.craftSweepStrategyBuild'),
    buy: t('industry.craftSweepStrategyBuy'),
  };
}

interface SweepStrategySelectProps {
  strategy: SweepStrategy;
  onChange: (strategy: SweepStrategy) => void;
  size?: ControlSize;
}

export function SweepStrategySelect({ strategy, onChange, size }: SweepStrategySelectProps) {
  const { t } = useTranslation();
  const label = useSweepStrategyLabels();
  return (
    <Select value={strategy} onValueChange={(value) => onChange(value as SweepStrategy)}>
      <SelectTrigger size={size} aria-label={t('industry.craftSweepStrategyLabel')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SWEEP_STRATEGIES.map((option) => (
          <SelectItem key={option} value={option}>
            {label[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const RESERVED_SCOPE_LABEL_KEY = {
  reactions: 'industry.craftScopeReactions',
  planetary: 'industry.craftScopePlanetary',
} as const;

interface CraftScopeChipsProps {
  /** The not-yet-functional methods to show as a reserved chip, in order — see `craftScopeReserved`. */
  reserved: readonly (keyof typeof RESERVED_SCOPE_LABEL_KEY)[];
}

/** Manufacturing always renders active: it's the only method a sweep currently marks buildable (`materialResolution.ts`). */
export function CraftScopeChips({ reserved }: CraftScopeChipsProps) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1">
      <span className="rounded-xs border border-accent-dim bg-accent/15 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
        {t('industry.craftScopeManufacturing')}
      </span>
      {reserved.map((key) => (
        <span
          key={key}
          aria-disabled="true"
          title={t('industry.craftScopeReserved')}
          className="rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase opacity-60"
        >
          {t(RESERVED_SCOPE_LABEL_KEY[key])}
        </span>
      ))}
    </span>
  );
}
