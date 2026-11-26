import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import type { BpoOffer } from './bpoAvailability';

interface BpoBadgeProps {
  bpo: BpoOffer;
  mayBeCheaper: boolean;
  locationName: string | null;
  regionName: string;
}

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
