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
 * "A BPO is for sale too" on a BPC Sourcing row (issue #1241). Price and
 * where are in the visible text so a phone reader gets them without a
 * gesture; the tooltip adds source, exact price, region and ME/TE. Its tap
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
  const details = [
    bpo.kind === 'market' ? t('bpcContracts.bpoSourceMarket') : t('bpcContracts.bpoSourceContract'),
    t('common.iskExact', { amount: formatIsk(bpo.price, 2) }),
    bpo.kind === 'market' && bpo.atHub
      ? t('bpcContracts.bpoLocationAtHub', { location: where, region: regionName })
      : t('bpcContracts.bpoLocation', { location: where, region: regionName }),
    t('bpcContracts.bpoMeTe', { me: bpo.me, te: bpo.te }),
    ...(mayBeCheaper ? [t('bpcContracts.bpoMayBeCheaperHint')] : []),
  ].join('\n');

  function stop(event: MouseEvent | KeyboardEvent) {
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
    event.stopPropagation();
  }

  return (
    <Tooltip content={details} openOnTap>
      <button
        type="button"
        onClick={stop}
        onKeyDown={stop}
        className={cx(
          'inline-flex max-w-full min-w-0 items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[0.6875rem] font-normal focus-visible:outline-2 focus-visible:outline-accent',
          mayBeCheaper
            ? 'border-accent-dim bg-panel-2 text-accent'
            : 'border-line bg-panel-2 text-text-dim'
        )}
      >
        {mayBeCheaper && (
          <span className="shrink-0 font-semibold">{t('bpcContracts.bpoMayBeCheaper')}</span>
        )}
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </Tooltip>
  );
}
