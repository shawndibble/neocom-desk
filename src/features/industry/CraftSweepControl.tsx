import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  InfoTooltip,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';
import { CraftScopeChips, SweepStrategySelect } from './craftSweepShared';

interface CraftSweepControlProps {
  /**
   * This plan's own material tree's deepest level with a recipe (`maxSweepDepth`) —
   * bounds Sweep Depth's range. 0 means nothing in the tree has a recipe, so
   * there is nothing to sweep.
   */
  maxDepth: number;
  /**
   * Production methods currently eligible to sweep (issue #698's `craftScope`)
   * — the same answer the recursive engine and the manual per-item toggle use,
   * so this chip row can never promise more than a sweep will actually apply.
   * Manufacturing is always eligible; Reactions lights up only when Include
   * Reactions is on (or the plan's own activity is a reaction). Planetary
   * stays reserved regardless — out of scope for #698.
   */
  scope: readonly MakeMethod[];
  /** Not ready to apply: gated on a previous Apply's own market fetch still being in flight. */
  disabled?: boolean;
  /** Pre-fills Sweep Strategy (issue #696's Build Group default); defaults to `'cost-effective'` when absent. */
  initialStrategy?: SweepStrategy;
  /** Pre-fills Sweep Depth (issue #696's Build Group default); defaults to `'all'` when absent. */
  initialDepthChoice?: DepthChoice;
  /** Names the affected plan count in the overwrite confirmation. */
  confirmMessage?: string;
  onApply: (options: { strategy: SweepStrategy; depth: number; depthChoice: DepthChoice }) => void;
}

/** 'all' is a sentinel distinct from any numeric depth — resolved to `maxDepth` on apply. */
export type DepthChoice = 'all' | number;

/**
 * Craft Sweep (issue #695): the Build Group's own one-shot bulk build/buy
 * control, applied once per member (`craftSweepGroup.ts`). Picks a Sweep
 * Strategy and Sweep Depth, then — behind a generic overwrite confirmation,
 * never a computed preview (that would require running the walk twice per
 * press) — overwrites every member's `buildHere` to match. The single-plan
 * equivalent is `BuildPlanCraftSweepControl.tsx`, which offers no Sweep
 * Depth choice and applies without confirmation; the Sweep Strategy select
 * and Craft Scope chips both controls share live in `craftSweepShared.tsx`.
 * Craft Scope's Manufacturing chip is always lit; Reactions lights up
 * exactly when `scope` includes it (issue #698 — Include Reactions on, or a
 * member's own activity is a reaction), else it reads the same
 * reserved-and-disabled way it always has. Planetary stays reserved
 * regardless — a later, unspecced ticket.
 */
export function CraftSweepControl({
  maxDepth,
  scope,
  disabled,
  initialStrategy,
  initialDepthChoice,
  confirmMessage,
  onApply,
}: CraftSweepControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<SweepStrategy>(initialStrategy ?? 'cost-effective');
  // A restored numeric choice can outlive the tree it was measured against
  // (the group's members changed since it was stored) and fall outside this
  // mount's own `maxDepth` range, where no `<SelectItem>` would match it —
  // falling back to 'all' is always in range, whatever `maxDepth` turns out
  // to be, the same reason `BuildGroupCraftSweepDefault.depthChoice` prefers
  // storing 'all' over a resolved number in the first place.
  const [depthChoice, setDepthChoice] = useState<DepthChoice>(() => {
    if (initialDepthChoice === undefined || initialDepthChoice === 'all') return 'all';
    return initialDepthChoice <= maxDepth ? initialDepthChoice : 'all';
  });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const depthOptions = Array.from({ length: maxDepth }, (_, i) => i + 1);
  const resolvedDepth = depthChoice === 'all' ? maxDepth : depthChoice;

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
        <label className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-text-dim">
            {t('industry.craftSweepDepthLabel')}
          </span>
          <Select
            value={String(depthChoice)}
            onValueChange={(value) => setDepthChoice(value === 'all' ? 'all' : Number(value))}
          >
            <SelectTrigger size="sm" aria-label={t('industry.craftSweepDepthLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {depthOptions.map((depth) => (
                <SelectItem key={depth} value={String(depth)}>
                  {t('industry.craftSweepDepthLevels', { count: depth })}
                </SelectItem>
              ))}
              <SelectItem value="all">{t('industry.craftSweepDepthAll')}</SelectItem>
            </SelectContent>
          </Select>
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
              onApply({ strategy, depth: resolvedDepth, depthChoice });
            }}
          >
            {t('industry.craftSweepApply')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
