import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';
import { usePriceBreakdown, type PriceBreakdownInput } from './usePriceBreakdown';
import { OrePricedCard } from './OrePricedCard';

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
