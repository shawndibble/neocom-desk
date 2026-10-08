/**
 * "Make it fit…": the smallest swaps that bring an over-budget Fitting back
 * under CPU/PG/calibration, each with what it changes and what it costs.
 * A row click applies it as one ordinary edit, so Back undoes it.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Disclosure, IskAmount, Modal, Spinner } from '@/components/ui';
import type { FitOption } from '@/engine/fittings/makeItFit';
import { diffFittingStats, type StatChange } from '@/engine/fittings/variationDelta';
import { changeLabel } from './fittingVariationsCsv';
import type { FittingCatalogue } from './useFittingCatalogue';
import { catalogueTypeName } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';
import { useMakeItFit } from './useMakeItFit';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

const OPTION_LIMIT = 8;

type Translate = Parameters<typeof changeLabel>[1];

const optionKey = (option: FitOption) =>
  option.swaps.map((s) => `${s.slot}${s.slotIndex}${s.toTypeId}`).join();

/**
 * The trade-off in one line ("EHP -293, resists lower") with the other stats
 * counted; every number stays in the expander beneath it.
 */
function tradeOffSummary(changes: StatChange[], t: Translate): string {
  if (changes.length === 0) return t('fittings.variations.noChanges');
  const ehp = changes.find((change) => change.key === 'ehp');
  const resists = changes.filter((change) => change.key.endsWith('Resonance'));
  const others = changes.length - resists.length - (ehp ? 1 : 0);
  const deltas = resists.map((change) => change.after - change.before);
  // Some up and some down: no honest direction, so say only that they changed.
  const mixed = deltas.some((d) => d > 0) && deltas.some((d) => d < 0);
  const net = mixed ? 0 : deltas.reduce((a, b) => a + b, 0);
  return [
    ehp ? changeLabel(ehp, t) : null,
    resists.length > 0
      ? t(
          net < 0
            ? 'fittings.makeItFit.resistsLower'
            : net > 0
              ? 'fittings.makeItFit.resistsHigher'
              : 'fittings.makeItFit.resistsChanged'
        )
      : null,
    others > 0 ? t('fittings.makeItFit.otherStats', { count: others }) : null,
  ]
    .filter(Boolean)
    .join(', ');
}

interface Props {
  open: boolean;
  onClose: () => void;
  variants: VariantEvaluator | null;
  catalogue: FittingCatalogue | null;
  onApply: (option: FitOption) => void;
  /** Leaves the dialog for the module List, where a swap can be picked by hand; absent when the List is already showing. */
  onOpenList?: () => void;
  placement: 'center' | 'sheet';
}

export function MakeItFitDialog({
  open,
  onClose,
  variants,
  catalogue,
  onApply,
  onOpenList,
  placement,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const { result, before, failed } = useMakeItFit(variants, catalogue, open);
  const name = (typeId: number) => catalogueTypeName(catalogue, typeId);
  const swapLabel = (swap: FitOption['swaps'][number]) =>
    t('fittings.makeItFit.swap', { from: name(swap.fromTypeId), to: name(swap.toTypeId) });
  const shown = result?.options.slice(0, OPTION_LIMIT) ?? [];
  // Two rows that read the same (two Gyrostabilizers) are told apart by their slot.
  const labelCounts = new Map<string, number>();
  for (const option of shown)
    for (const swap of option.swaps)
      labelCounts.set(swapLabel(swap), (labelCounts.get(swapLabel(swap)) ?? 0) + 1);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('fittings.makeItFit.title')}
      placement={placement}
    >
      {failed ? (
        <p className="text-danger text-sm">{t('fittings.makeItFit.failed')}</p>
      ) : result === null || before === null ? (
        <p className="text-text-dim flex items-center gap-2 text-sm">
          <Spinner /> {t('fittings.makeItFit.searching')}
        </p>
      ) : result.options.length === 0 ? (
        <div className="space-y-2">
          <p className="text-text-dim text-sm">
            {result.nothingFits
              ? t('fittings.makeItFit.nothingFits')
              : t('fittings.makeItFit.fits')}
          </p>
          {result.nothingFits && onOpenList && (
            <Button size="sm" onClick={onOpenList}>
              {t('fittings.makeItFit.openList')}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-text-dim text-xs">
            {t('fittings.makeItFit.hint')}
            {result.options.length > OPTION_LIMIT &&
              ` ${t('fittings.makeItFit.showing', { shown: OPTION_LIMIT, total: result.options.length })}`}
          </p>
          {shown.some((option) => option.iskDelta === null) && (
            <p className="text-text-dim text-xs">{t('fittings.makeItFit.noPrice')}</p>
          )}
          <ul className="space-y-1">
            {shown.map((option) => {
              const delta = diffFittingStats(before, option.after);
              const key = optionKey(option);
              return (
                <li key={key} className="border-line rounded-xs border">
                  <button
                    type="button"
                    className={cx(
                      'w-full rounded-xs p-2 text-left text-sm',
                      rowInteractiveClassName,
                      focusRingInsetClassName
                    )}
                    onClick={() => onApply(option)}
                  >
                    {option.swaps.map((swap) => {
                      const label = swapLabel(swap);
                      return (
                        <p key={`${swap.slot}${swap.slotIndex}`} className="font-medium">
                          {label}
                          {(labelCounts.get(label) ?? 0) > 1 && (
                            <span className="text-text-dim font-normal">
                              {' · '}
                              {t(`fittings.makeItFit.slot.${swap.slot}`, {
                                index: swap.slotIndex + 1,
                              })}
                            </span>
                          )}
                        </p>
                      );
                    })}
                    <p className="text-text-dim mt-0.5 text-xs">
                      {tradeOffSummary(delta.changes, t)}
                    </p>
                    {option.iskDelta !== null && (
                      <p className="mt-0.5 text-xs">
                        {option.iskDelta < 0 ? (
                          <span className="text-success">
                            {t('fittings.makeItFit.saves')} <IskAmount value={-option.iskDelta} />
                          </span>
                        ) : (
                          <span>
                            {t('fittings.makeItFit.costs')} <IskAmount value={option.iskDelta} />
                          </span>
                        )}
                      </p>
                    )}
                  </button>
                  {delta.changes.length > 0 && (
                    <Disclosure
                      label={t('fittings.makeItFit.details')}
                      expanded={expanded.has(key)}
                      onToggle={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (!next.delete(key)) next.add(key);
                          return next;
                        })
                      }
                    >
                      <p className="text-text-dim flex flex-wrap gap-x-2 px-2 pb-2 text-xs">
                        {delta.changes.map((change) => (
                          <span key={change.key}>{changeLabel(change, t)}</span>
                        ))}
                      </p>
                    </Disclosure>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
