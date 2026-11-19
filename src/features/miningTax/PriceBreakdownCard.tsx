import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';
import { usePriceBreakdown, type PriceBreakdownInput } from './usePriceBreakdown';
import { OrePricedCard } from './OrePricedCard';

/**
 * The ore of an assigned day with what the estimate was built from — per-ore unit
 * price, the hub and ore form (the tax % is in the modal's header line). Copying it
 * as text lives in the row detail's More menu. Unit prices are re-derived for the
 * mined date, not frozen with the bill, so any drift from the frozen total is called
 * out. A saved-snapshot price is the norm and says nothing; only another source does.
 */
export function PriceBreakdownCard({
  quantityFor,
  ...props
}: PriceBreakdownInput & { quantityFor?: (typeId: number) => ReactNode }) {
  const { t } = useTranslation();
  const { assignment } = props;
  const { breakdown, hub, form, name, sourceLabel, unitText, drifted } = usePriceBreakdown(props);

  return (
    <OrePricedCard
      title={t('miningTax.oreColumn')}
      lines={breakdown.lines.map((l) => ({
        typeId: l.typeId,
        name: name(l.typeId),
        quantity: quantityFor?.(l.typeId) ?? formatCount(l.quantity),
        unit: unitText(l.overridden ? undefined : l.unitPrice),
        source: !l.overridden && l.source === 'saved' ? undefined : sourceLabel(l),
      }))}
      note={
        <>
          <p>{t('miningTax.detail.breakdown.summary', { hub: hub.name, form })}</p>
          <p>
            {drifted
              ? t('miningTax.detail.breakdown.drift', {
                  value: formatIsk(assignment.estimatedValue),
                })
              : t('miningTax.detail.breakdown.caveat')}
          </p>
        </>
      }
    />
  );
}
