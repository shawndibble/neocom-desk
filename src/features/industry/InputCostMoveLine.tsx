import { useTranslation } from 'react-i18next';
import type { InputCostMove } from '@/engine/market/inputCostMove';
import { formatVsMedianPct } from '@/features/market/format';
import { cx } from '@/lib/cx';

/** One muted line; amber only when cost rose and the product did not. */
export function InputCostMoveLine({ move, inputName }: { move: InputCostMove; inputName: string }) {
  const { t } = useTranslation();
  const warn = move.costPct > 0 && move.productPct !== null && move.productPct <= 0;
  const values = {
    cost: formatVsMedianPct(move.costPct),
    input: inputName,
    share: Math.round(move.topInput.sharePct),
  };
  return (
    <p className={cx('text-xs', warn ? 'text-warning' : 'text-text-dim')}>
      {move.productPct === null
        ? t('industry.inputCostMove', values)
        : t('industry.inputCostMoveWithProduct', {
            ...values,
            product: formatVsMedianPct(move.productPct),
          })}
    </p>
  );
}
