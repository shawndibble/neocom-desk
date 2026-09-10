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

interface CraftSweepControlProps {
  /**
   * This plan's own material tree's deepest level with a recipe (`maxSweepDepth`) —
   * bounds Sweep Depth's range. 0 means nothing in the tree has a recipe, so
   * there is nothing to sweep.
   */
  maxDepth: number;
  /**
   * Not ready to apply: the single-plan caller gates this on live prices
   * having landed (cost-effective needs them, same as `pricesReady`
   * elsewhere on that plan); the Build Group caller instead gates it on a
   * previous Apply's own market fetch still being in flight.
   */
  disabled?: boolean;
  /** Pre-fills Sweep Strategy (issue #696's Build Group default); defaults to `'cost-effective'` when absent. */
  initialStrategy?: SweepStrategy;
  /** Pre-fills Sweep Depth (issue #696's Build Group default); defaults to `'all'` when absent. */
  initialDepthChoice?: DepthChoice;
  /** Overrides the generic single-plan confirm copy — Build Group names the affected plan count instead. */
  confirmMessage?: string;
  onApply: (options: { strategy: SweepStrategy; depth: number; depthChoice: DepthChoice }) => void;
}

const SWEEP_STRATEGIES: readonly SweepStrategy[] = ['cost-effective', 'build', 'buy'];

/** 'all' is a sentinel distinct from any numeric depth — resolved to `maxDepth` on apply. */
export type DepthChoice = 'all' | number;

/**
 * Craft Sweep (issue #695): a one-shot bulk build/buy control for a single
 * Build Plan. Picks a Sweep Strategy and Sweep Depth, then — behind a
 * generic overwrite confirmation, never a computed preview (that would
 * require running the walk twice per press) — overwrites this plan's
 * `buildHere` to match. Craft Scope is shown but not yet interactive: only
 * Manufacturing is functional this round (docs/context/decisions), Reactions
 * and Planetary are reserved slots for later tickets rather than hidden.
 */
export function CraftSweepControl({
  maxDepth,
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

  const strategyLabel: Record<SweepStrategy, string> = {
    'cost-effective': t('industry.craftSweepStrategyCostEffective'),
    build: t('industry.craftSweepStrategyBuild'),
    buy: t('industry.craftSweepStrategyBuy'),
  };

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
          <Select value={strategy} onValueChange={(value) => setStrategy(value as SweepStrategy)}>
            <SelectTrigger size="sm" aria-label={t('industry.craftSweepStrategyLabel')}>
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
        <span className="flex items-center gap-1">
          <span className="rounded-xs border border-accent-dim bg-accent/15 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
            {t('industry.craftScopeManufacturing')}
          </span>
          <span
            aria-disabled="true"
            title={t('industry.craftScopeReserved')}
            className="rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase opacity-60"
          >
            {t('industry.craftScopeReactions')}
          </span>
          <span
            aria-disabled="true"
            title={t('industry.craftScopeReserved')}
            className="rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase opacity-60"
          >
            {t('industry.craftScopePlanetary')}
          </span>
        </span>
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
