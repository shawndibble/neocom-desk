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
import type { MakeMethod } from '@/engine/industry/makeOrBuy';

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

const ACTIVE_CLASSES =
  'rounded-xs border border-accent-dim bg-accent/15 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase';
const RESERVED_CLASSES =
  'rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase opacity-60';

interface CraftScopeChipsProps {
  /**
   * Production methods currently eligible to sweep (issue #698's
   * `craftScope`) — the same answer the recursive engine and the manual
   * per-item toggle use, so this chip row can never promise more than a
   * sweep will actually apply. Manufacturing is always eligible; Reactions
   * lights up only when `scope` includes it (Include Reactions on, or the
   * plan's own activity is a reaction). Planetary is never in `scope` yet —
   * out of scope for #698 — and always renders reserved.
   */
  scope: readonly MakeMethod[];
}

/** Manufacturing always renders active: every caller's `scope` includes it unconditionally. */
export function CraftScopeChips({ scope }: CraftScopeChipsProps) {
  const { t } = useTranslation();
  const reactionsEligible = scope.includes('reaction');
  return (
    <span className="flex items-center gap-1">
      <span className={ACTIVE_CLASSES}>{t('industry.craftScopeManufacturing')}</span>
      <span
        aria-disabled={reactionsEligible ? undefined : true}
        title={reactionsEligible ? undefined : t('industry.craftScopeReactionsDisabledHint')}
        className={reactionsEligible ? ACTIVE_CLASSES : RESERVED_CLASSES}
      >
        {t('industry.craftScopeReactions')}
      </span>
      <span
        aria-disabled="true"
        title={t('industry.craftScopeReserved')}
        className={RESERVED_CLASSES}
      >
        {t('industry.craftScopePlanetary')}
      </span>
    </span>
  );
}
