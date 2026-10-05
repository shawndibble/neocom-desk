import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
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
    <Tooltip content={details} openOnTap>
      <button
        type="button"
        aria-label={`${text} · ${label}`}
        onClick={stop}
        onKeyDown={stop}
        className={cx(
          'inline-flex max-w-full min-w-0 items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[0.6875rem] font-normal focus-visible:outline-2 focus-visible:outline-accent',
          mayBeCheaper
            ? 'border-accent-dim bg-panel-2 text-accent'
            : 'border-line bg-panel-2 text-text-dim'
        )}
      >
        <span className={cx('min-w-0 truncate', mayBeCheaper && 'font-semibold')}>{text}</span>
      </button>
    </Tooltip>
  );
}
