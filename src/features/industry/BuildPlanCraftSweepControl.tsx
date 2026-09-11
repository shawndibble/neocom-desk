import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';
import { CraftScopeChips, SweepStrategySelect } from './craftSweepShared';

interface BuildPlanCraftSweepControlProps {
  /** Nothing to sweep — the select stays disabled (this plan's tree has no recipe at all). */
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
 * 20260909 and 20260910-082156 sweep decisions superseded for this surface,
 * issue #778). Unlike the Build Group's `CraftSweepControl`, this one always
 * sweeps this plan's whole tree — there is no Sweep Depth choice — and
 * applies with no confirmation: a single plan's `buildHere` is cheap to
 * hand-correct afterward, and the overwrite-confirmation only earned its
 * keep for a Build Group's multi-plan blast radius. Changing Sweep Strategy
 * applies immediately. A controlled `<select>` never fires a change event
 * for reselecting its already-shown value though (Radix's own
 * `useControllableState`, same as a native `<select>`) — so the default
 * Cost-effective sweep would otherwise be unreachable for anyone who never
 * touches the dropdown. The icon-only re-run button beside it (`Icon.Run` —
 * deliberately not `Icon.Refresh`, which means "re-fetch from ESI" and
 * fetches nothing here) covers that: one press, no label, no confirmation —
 * a lighter affordance than the group control's labeled Apply behind a
 * confirm dialog, but still an explicit press, on direct instruction after
 * that gap surfaced. The Sweep Strategy select and Craft Scope chips are the
 * pieces genuinely shared with the group control — `craftSweepShared.tsx`.
 *
 * Craft Scope's Reactions chip lights up exactly when `scope` includes it
 * (issue #698 — Include Reactions on, or the plan's own activity is a
 * reaction). Manufacturing and Planetary are never shown as chips at all —
 * every sweep always includes Manufacturing, and Planetary is not yet a
 * sweep-eligible method on any surface.
 */
export function BuildPlanCraftSweepControl({
  maxDepth,
  scope,
  disabled,
  onApply,
}: BuildPlanCraftSweepControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<SweepStrategy>('cost-effective');
  const canApply = !disabled && maxDepth > 0;

  function handleStrategyChange(next: SweepStrategy) {
    setStrategy(next);
    if (canApply) onApply({ strategy: next });
  }

  return (
    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <span className="whitespace-nowrap">{t('industry.craftSweepStrategyLabel')}</span>
      <SweepStrategySelect
        strategy={strategy}
        onChange={handleStrategyChange}
        size="sm"
        disabled={!canApply}
      />
      <CraftScopeChips scope={scope} />
      <IconButton
        size="sm"
        icon={<Icon.Run />}
        label={t('industry.craftSweepApply')}
        onClick={() => onApply({ strategy })}
        disabled={!canApply}
      />
    </div>
  );
}
