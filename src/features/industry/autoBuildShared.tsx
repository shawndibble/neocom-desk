import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  type ControlSize,
} from '@/components/ui';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';

/**
 * Pieces the Build Group's `AutoBuildControl` and the single-plan
 * `BuildPlanAutoBuildControl` both compose unchanged: the same three Build
 * Strategy choices and the same Craft Scope chip look. Kept in one place so
 * a future label or style tweak lands once rather than being hand-kept in
 * sync across both files. Each control's own shape around these pieces —
 * header/tooltip, confirmation — stays genuinely separate; only what was
 * actually identical between them moved here.
 */

const BUILD_STRATEGIES: readonly BuildStrategy[] = ['cost-effective', 'build', 'buy'];

function useBuildStrategyLabels(): Record<BuildStrategy, string> {
  const { t } = useTranslation();
  return {
    'cost-effective': t('industry.buildStrategyCostEffective'),
    build: t('industry.buildStrategyBuild'),
    buy: t('industry.buildStrategyBuy'),
  };
}

interface BuildStrategySelectProps {
  strategy: BuildStrategy;
  onChange: (strategy: BuildStrategy) => void;
  size?: ControlSize;
  /**
   * The single-plan `BuildPlanAutoBuildControl` passes this while there is
   * nothing to auto-build or prices aren't ready — it applies on change and
   * has no Apply button of its own to gate instead (issue #798 dropped the
   * re-run button this used to also cover), so a disabled trigger is the
   * only way to block that. The Build Group's `AutoBuildControl` does not
   * pass it: its select stays live while prices load — pre-pick a strategy,
   * then Apply — and only its own Apply button is gated.
   */
  disabled?: boolean;
}

export function BuildStrategySelect({
  strategy,
  onChange,
  size,
  disabled,
}: BuildStrategySelectProps) {
  const { t } = useTranslation();
  const label = useBuildStrategyLabels();
  return (
    <Select
      value={strategy}
      onValueChange={(value) => onChange(value as BuildStrategy)}
      disabled={disabled}
    >
      <SelectTrigger size={size} aria-label={t('industry.buildStrategyLabel')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BUILD_STRATEGIES.map((option) => (
          <SelectItem key={option} value={option}>
            {label[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// `h-7`, not the responsive `controlHeightClassName` scale: this chip is a
// non-interactive readout (never clickable — `aria-disabled`, an explanatory
// `Tooltip`, nothing else), the same category `StatChip`/`DataAgeBadge` are
// carved out for in DESIGN.md §3. Its own `py-0.5`-only rule left it shorter
// than the `sm` `Select`/`Button`/`IconButton` it sits beside in this row at
// every width — a `StatChip`-style flat height fixes that instead of
// growing it into the responsive scale it was never a target on.
// `cursor-help` matches the other non-button `Tooltip` triggers in the app
// (e.g. `OrderRowSummaryText`'s match note) — the only visual cue this chip
// has something to hover, since it draws no underline of its own.
const ACTIVE_CLASSES =
  'inline-flex h-7 shrink-0 cursor-help items-center rounded-xs border border-accent-dim bg-accent/15 px-2 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase';
const RESERVED_CLASSES =
  'inline-flex h-7 shrink-0 cursor-help items-center rounded-xs border border-line bg-panel-2 px-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase opacity-60';

interface CraftScopeChipsProps {
  /**
   * Production methods currently eligible to auto-build (issue #698's
   * `craftScope`) — the same answer the recursive engine and the manual
   * per-item toggle use, so this chip row can never promise more than an
   * Auto Build pass will actually apply. Manufacturing is always in `scope`
   * and isn't shown here at all (issue #778) — every Auto Build pass on
   * every surface includes it unconditionally, so a chip for it never
   * carries information. Reactions lights up only when `scope` includes it
   * (Include Reactions on, or the plan's own activity is a reaction).
   * Planetary is never in `scope` and has no chip at all (issue #798
   * dropped the reserved Planetary chip from both surfaces) — an
   * auto-build-eligible Planetary method would need one again then, not
   * before.
   */
  scope: readonly MakeMethod[];
}

/**
 * Just the Reactions chip — Manufacturing was dropped (issue #778) as a chip
 * that could never say anything: every Auto Build pass always includes it,
 * on both the group and single-plan surfaces, so it only ever repeated what
 * "Auto Build" already implies. Planetary's reserved chip was dropped the
 * same way (issue #798): Planetary is not an auto-build-eligible method on
 * any surface, so a permanently-disabled chip for it never carried
 * information either. The Reactions chip always carries a tooltip, lit or
 * not, explaining what it does either way.
 */
export function CraftScopeChips({ scope }: CraftScopeChipsProps) {
  const { t } = useTranslation();
  const reactionsEligible = scope.includes('reaction');
  return (
    <span className="flex items-center gap-1">
      <Tooltip
        content={
          reactionsEligible
            ? t('industry.craftScopeReactionsEnabledHint')
            : t('industry.craftScopeReactionsDisabledHint')
        }
        openOnTap
      >
        <span
          tabIndex={0}
          aria-disabled={reactionsEligible ? undefined : true}
          className={reactionsEligible ? ACTIVE_CLASSES : RESERVED_CLASSES}
        >
          {t('industry.craftScopeReactions')}
        </span>
      </Tooltip>
    </span>
  );
}
