import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import type { PricingGap } from '@/features/miningTax/pricingGaps';
import { typeLabels } from './typeLabels';

interface PricingGapLinksProps {
  gaps: readonly PricingGap[];
  /** Which of a gap's ore types the banner is naming. */
  pick: (gap: PricingGap) => number[];
  typeNames: ReadonlyMap<number, string>;
  systemName: (dr: DisplayRow) => string;
  onOpen: (dr: DisplayRow) => void;
}

/** Buttons that open each affected entry, naming the ore at fault — the table itself never shows per-ore prices. */
export function PricingGapLinks({
  gaps,
  pick,
  typeNames,
  systemName,
  onOpen,
}: PricingGapLinksProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5">
      <p>{t('miningTax.pricingGapEntries')}</p>
      <ul className="space-y-0.5">
        {gaps.map((gap) => (
          <li key={gap.row.key}>
            <button
              type="button"
              className={`text-left ${inlineLinkClassName}`}
              onClick={() => onOpen(gap.row)}
            >
              {t('miningTax.pricingGapEntry', {
                date: gap.row.row.entry.date,
                system: systemName(gap.row),
                types: typeLabels(pick(gap), typeNames),
              })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
