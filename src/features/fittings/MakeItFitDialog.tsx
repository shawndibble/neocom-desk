/**
 * "Make it fit…": the smallest swaps that bring an over-budget Fitting back
 * under CPU/PG/calibration, each with what it changes and what it costs.
 * A row click applies it as one ordinary edit, so Back undoes it.
 */
import { useTranslation } from 'react-i18next';
import { IskAmount, Modal, Spinner } from '@/components/ui';
import type { FitOption } from '@/engine/fittings/makeItFit';
import { diffFittingStats } from '@/engine/fittings/variationDelta';
import { changeLabel } from './fittingVariationsCsv';
import type { FittingCatalogue } from './useFittingCatalogue';
import { catalogueTypeName } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';
import { useMakeItFit } from './useMakeItFit';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

const OPTION_LIMIT = 8;

interface Props {
  open: boolean;
  onClose: () => void;
  variants: VariantEvaluator | null;
  catalogue: FittingCatalogue | null;
  onApply: (option: FitOption) => void;
  placement: 'center' | 'sheet';
}

export function MakeItFitDialog({ open, onClose, variants, catalogue, onApply, placement }: Props) {
  const { t } = useTranslation();
  const { result, before } = useMakeItFit(variants, catalogue, open);
  const name = (typeId: number) => catalogueTypeName(catalogue, typeId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('fittings.makeItFit.title')}
      placement={placement}
    >
      {result === null || before === null ? (
        <p className="text-text-dim flex items-center gap-2 text-sm">
          <Spinner /> {t('fittings.makeItFit.searching')}
        </p>
      ) : result.options.length === 0 ? (
        <p className="text-text-dim text-sm">
          {result.nothingFits ? t('fittings.makeItFit.nothingFits') : t('fittings.makeItFit.fits')}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-text-dim text-xs">{t('fittings.makeItFit.hint')}</p>
          <ul className="space-y-1">
            {result.options.slice(0, OPTION_LIMIT).map((option) => {
              const delta = diffFittingStats(before, option.after);
              return (
                <li key={option.swaps.map((s) => `${s.slot}${s.slotIndex}${s.toTypeId}`).join()}>
                  <button
                    type="button"
                    className={cx(
                      'border-line w-full rounded-xs border p-2 text-left text-sm',
                      rowInteractiveClassName
                    )}
                    onClick={() => onApply(option)}
                  >
                    {option.swaps.map((swap) => (
                      <p key={`${swap.slot}${swap.slotIndex}`} className="font-medium">
                        {t('fittings.makeItFit.swap', {
                          from: name(swap.fromTypeId),
                          to: name(swap.toTypeId),
                        })}
                      </p>
                    ))}
                    <p className="text-text-dim mt-0.5 flex flex-wrap gap-x-2 text-xs">
                      {delta.changes.map((change) => (
                        <span key={change.key}>{changeLabel(change, t)}</span>
                      ))}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {option.iskDelta === null ? (
                        <span className="text-text-dim">{t('fittings.makeItFit.noPrice')}</span>
                      ) : option.iskDelta < 0 ? (
                        <span className="text-success">
                          {t('fittings.makeItFit.saves')} <IskAmount value={-option.iskDelta} />
                        </span>
                      ) : (
                        <span>
                          {t('fittings.makeItFit.costs')} <IskAmount value={option.iskDelta} />
                        </span>
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
