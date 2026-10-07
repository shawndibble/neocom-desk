import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import type { BpoOffer } from './bpoAvailability';

interface BpoBadgeProps {
  bpo: BpoOffer;
  /** `bpoMayBeCheaper` for this row's own offer — highlights the badge. */
  mayBeCheaper: boolean;
  /** Station name of the BPO, `null` when unresolved (e.g. a player structure). */
  locationName: string | null;
  regionName: string;
}

/**
 * "A BPO is for sale too" on a BPC Sourcing row (issue #1241). The visible
 * text stays short so it never widens the Item column; price and location
 * live in the tooltip, one per line, and in the accessible name. Its tap
 * only explains (`openOnTap`), so it is stopped from reaching the row, whose
 * own tap opens the contract.
 */
export function BpoBadge({ bpo, mayBeCheaper, locationName, regionName }: BpoBadgeProps) {
  const { t } = useTranslation();
  const where = locationName ?? regionName;
  const label = t(
    bpo.kind === 'market' ? 'bpcContracts.bpoOnMarket' : 'bpcContracts.bpoOnContract',
    { price: formatIskCompact(bpo.price), where }
  );
  const text = t(mayBeCheaper ? 'bpcContracts.bpoMayBeCheaper' : 'bpcContracts.bpoForSale');
  const details = [
    t('bpcContracts.bpoPrice', {
      price: t('common.iskExact', { amount: formatIsk(bpo.price, 2) }),
    }),
    bpo.kind === 'market' && bpo.atHub
      ? t('bpcContracts.bpoLocationAtHub', { location: where, region: regionName })
      : t('bpcContracts.bpoLocation', { location: where, region: regionName }),
  ].join('\n');

  function stop(event: MouseEvent | KeyboardEvent) {
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
    event.stopPropagation();
  }

  return (
    // Static label with a tooltip: no box (§6c). The wrapper stops the tap
    // reaching the row, whose own tap opens the contract.
    <span onClick={stop} onKeyDown={stop} className="inline-flex max-w-full min-w-0">
      <HintText
        content={details}
        className={cx(
          'min-w-0 truncate text-[0.6875rem] font-normal',
          mayBeCheaper ? 'font-semibold text-text' : 'text-text-dim'
        )}
      >
        <span className="sr-only">{`${label} · `}</span>
        {text}
      </HintText>
    </span>
  );
}
