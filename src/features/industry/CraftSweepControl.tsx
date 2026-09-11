import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InfoTooltip, Modal } from '@/components/ui';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';
import { CraftScopeChips, SweepStrategySelect } from './craftSweepShared';

interface CraftSweepControlProps {
  /**
   * This plan's own material tree's deepest level with a recipe
   * (`maxSweepDepth`). 0 means nothing in the tree has a recipe, so there is
   * nothing to sweep; otherwise a sweep always walks the whole tree, the
   * same as the single-plan control (issue #798 dropped the Sweep Depth
   * choice — see the decision file).
   */
  maxDepth: number;
  /**
   * Production methods currently eligible to sweep (issue #698's `craftScope`)
   * — the same answer the recursive engine and the manual per-item toggle use,
   * so this chip row can never promise more than a sweep will actually apply.
   * Manufacturing is always eligible and isn't shown as a chip (issue #778 —
   * every sweep always includes it); Reactions lights up only when Include
   * Reactions is on (or the plan's own activity is a reaction).
   */
  scope: readonly MakeMethod[];
  /** Not ready to apply: gated on a previous Apply's own market fetch still being in flight. */
  disabled?: boolean;
  /** Pre-fills Sweep Strategy (issue #696's Build Group default); defaults to `'cost-effective'` when absent. */
  initialStrategy?: SweepStrategy;
  /** Names the affected plan count in the overwrite confirmation. */
  confirmMessage?: string;
  onApply: (options: { strategy: SweepStrategy }) => void;
}

/**
 * Craft Sweep (issue #695): the Build Group's own one-shot bulk build/buy
 * control, applied once per member (`craftSweepGroup.ts`). Picks a Sweep
 * Strategy, then — behind a generic overwrite confirmation, never a computed
 * preview (that would require running the walk twice per press) —
 * overwrites every member's `buildHere` to match, always across each
 * member's own whole tree (issue #798 dropped the Sweep Depth choice — see
 * the decision file). The single-plan equivalent is
 * `BuildPlanCraftSweepControl.tsx`, which applies without confirmation; the
 * Sweep Strategy select and Craft Scope chips both controls share live in
 * `craftSweepShared.tsx`. Craft Scope's Manufacturing chip is always lit;
 * Reactions lights up exactly when `scope` includes it (issue #698 —
 * Include Reactions on, or a member's own activity is a reaction), else it
 * reads the same reserved-and-disabled way it always has.
 */
export function CraftSweepControl({
  maxDepth,
  scope,
  disabled,
  initialStrategy,
  confirmMessage,
  onApply,
}: CraftSweepControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<SweepStrategy>(initialStrategy ?? 'cost-effective');
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.craftSweepLabel')}
        </span>
        <InfoTooltip
          label={t('industry.craftSweepTooltipLabel')}
          content={t('industry.craftSweepTooltip')}
        />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-text-dim">
            {t('industry.craftSweepStrategyLabel')}
          </span>
          <SweepStrategySelect strategy={strategy} onChange={setStrategy} size="sm" />
        </label>
        <CraftScopeChips scope={scope} />
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={disabled || maxDepth === 0}
        >
          {t('industry.craftSweepApply')}
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('industry.craftSweepLabel')}
      >
        <p className="text-xs text-text-dim">{confirmMessage ?? t('industry.craftSweepConfirm')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setConfirmOpen(false)}>
            {t('industry.cancel')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setConfirmOpen(false);
              onApply({ strategy });
            }}
          >
            {t('industry.craftSweepApply')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
