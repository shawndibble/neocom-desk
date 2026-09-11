import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';
import { CraftScopeChips, BuildStrategySelect } from './autoBuildShared';

interface AutoBuildControlProps {
  /**
   * This plan's own material tree's deepest level with a recipe
   * (`maxAutoBuildDepth`). 0 means nothing in the tree has a recipe, so there is
   * nothing to auto-build; otherwise Auto Build always walks the whole tree,
   * the same as the single-plan control (issue #798 dropped the depth
   * choice — see the decision file).
   */
  maxDepth: number;
  /**
   * Production methods currently eligible to auto-build (issue #698's
   * `craftScope`) — the same answer the recursive engine and the manual
   * per-item toggle use, so this chip row can never promise more than an
   * Auto Build pass will actually apply. Manufacturing is always eligible
   * and isn't shown as a chip (issue #778 — every Auto Build pass always
   * includes it); Reactions lights up only when Include Reactions is on (or
   * the plan's own activity is a reaction).
   */
  scope: readonly MakeMethod[];
  /** Not ready to apply: gated on a previous Apply's own market fetch still being in flight. */
  disabled?: boolean;
  /** Pre-fills Build Strategy (issue #696's Build Group default); defaults to `'cost-effective'` when absent. */
  initialStrategy?: BuildStrategy;
  /** Names the affected plan count in the overwrite confirmation. */
  confirmMessage?: string;
  onApply: (options: { strategy: BuildStrategy }) => void;
}

/**
 * Auto Build (issue #695): the Build Group's own one-shot bulk build/buy
 * control, applied once per member (`autoBuildGroup.ts`). Picks a Build
 * Strategy, then — behind a generic overwrite confirmation, never a computed
 * preview (that would require running the walk twice per press) —
 * overwrites every member's `buildHere` to match, always across each
 * member's own whole tree (issue #798 dropped the depth choice — see
 * the decision file). The single-plan equivalent is
 * `BuildPlanAutoBuildControl.tsx`, which applies without confirmation; the
 * Build Strategy select and Craft Scope chips both controls share live in
 * `autoBuildShared.tsx`. Craft Scope's Manufacturing chip is always lit;
 * Reactions lights up exactly when `scope` includes it (issue #698 —
 * Include Reactions on, or a member's own activity is a reaction), else it
 * reads the same reserved-and-disabled way it always has.
 */
export function AutoBuildControl({
  maxDepth,
  scope,
  disabled,
  initialStrategy,
  confirmMessage,
  onApply,
}: AutoBuildControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<BuildStrategy>(initialStrategy ?? 'cost-effective');
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-text-dim">
            {t('industry.buildStrategyLabel')}
          </span>
          <BuildStrategySelect strategy={strategy} onChange={setStrategy} size="sm" />
        </label>
        <CraftScopeChips scope={scope} />
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={disabled || maxDepth === 0}
        >
          {t('industry.autoBuildApply')}
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('industry.autoBuildLabel')}
      >
        <p className="text-xs text-text-dim">{confirmMessage ?? t('industry.autoBuildConfirm')}</p>
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
            {t('industry.autoBuildApply')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
