import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { usePriceBreakdown, type PriceBreakdownInput } from './usePriceBreakdown';
import { OreLink } from './OreIcon';

/**
 * What the estimate was built from — per-ore unit price and where it came
 * from, the hub, the ore form and the tax %. Copying it as text lives in the
 * row detail's More menu. Unit prices are re-derived for the mined date, not
 * frozen with the bill, so any drift from the frozen total is called out.
 */
export function PriceBreakdownCard(props: PriceBreakdownInput) {
  const { t } = useTranslation();
  const { assignment } = props;
  const { breakdown, hub, form, name, sourceLabel, unitText, drifted } = usePriceBreakdown(props);

  return (
    <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
      <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('miningTax.detail.breakdown.title')}
      </p>
      <p className="text-xs text-text-dim">
        {t('miningTax.detail.breakdown.summary', {
          hub: hub.name,
          form,
          tax: assignment.taxPct,
        })}
      </p>
      <ul className="divide-y divide-line text-xs">
        {breakdown.lines.map((l) => (
          <li key={l.typeId} className="flex flex-wrap items-baseline gap-x-2 py-1">
            <span className="min-w-0 flex-1 truncate">
              <OreLink typeId={l.typeId}>{name(l.typeId)}</OreLink>
            </span>
            <span className="tabular-nums text-text-dim">
              {l.quantity.toLocaleString()} × {unitText(l.overridden ? undefined : l.unitPrice)}
            </span>
            <span className="text-text-dim">{sourceLabel(l)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-dim">
        {drifted
          ? t('miningTax.detail.breakdown.drift', { value: formatIsk(assignment.estimatedValue) })
          : t('miningTax.detail.breakdown.caveat')}
      </p>
    </div>
  );
}
