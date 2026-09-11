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
 * header/tooltip, confirmation — stays genuinely separate; only what was
 * actually identical between them moved here.
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
  /**
   * The single-plan `BuildPlanCraftSweepControl` passes this while there is
   * nothing to sweep or prices aren't ready — it applies on change and on
   * its own re-run press, so a disabled trigger is the only way to block
   * that. The Build Group's `CraftSweepControl` does not pass it: its select
   * stays live while prices load — pre-pick a strategy, then Apply — and
   * only its own Apply button is gated.
   */
  disabled?: boolean;
}

export function SweepStrategySelect({
  strategy,
  onChange,
  size,
  disabled,
}: SweepStrategySelectProps) {
  const { t } = useTranslation();
  const label = useSweepStrategyLabels();
  return (
    <Select
      value={strategy}
      onValueChange={(value) => onChange(value as SweepStrategy)}
      disabled={disabled}
    >
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
   * sweep will actually apply. Manufacturing is always in `scope` and isn't
   * shown here at all (issue #778) — every sweep on every surface includes
   * it unconditionally, so a chip for it never carries information. Reactions
   * lights up only when `scope` includes it (Include Reactions on, or the
   * plan's own activity is a reaction). Planetary is never in `scope` and has
   * no chip at all (issue #798 dropped the reserved Planetary chip from both
   * surfaces) — a sweep-eligible Planetary method would need one again then,
   * not before.
   */
  scope: readonly MakeMethod[];
}

/**
 * Just the Reactions chip — Manufacturing was dropped (issue #778) as a chip
 * that could never say anything: every sweep always includes it, on both the
 * group and single-plan surfaces, so it only ever repeated what "Craft
 * Sweep" already implies. Planetary's reserved chip was dropped the same way
 * (issue #798): Planetary is not a sweep-eligible method on any surface, so
 * a permanently-disabled chip for it never carried information either. The
 * Reactions chip always carries a tooltip, lit or not, explaining what it
 * does either way.
 */
export function CraftScopeChips({ scope }: CraftScopeChipsProps) {
  const { t } = useTranslation();
  const reactionsEligible = scope.includes('reaction');
  return (
    <span className="flex items-center gap-1">
      <span
        aria-disabled={reactionsEligible ? undefined : true}
        title={
          reactionsEligible
            ? t('industry.craftScopeReactionsEnabledHint')
            : t('industry.craftScopeReactionsDisabledHint')
        }
        className={reactionsEligible ? ACTIVE_CLASSES : RESERVED_CLASSES}
      >
        {t('industry.craftScopeReactions')}
      </span>
    </span>
  );
}
