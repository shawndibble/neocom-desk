import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { MARKET_WIDE_PAGE_SIZE } from './marketWidePage';

interface MarketWideShowMoreProps {
  shown: number;
  total: number;
  isDesktop: boolean;
  onShowMore: () => void;
}

/** The "showing N of M" count and the button that reveals the next page of the ranking. */
export function MarketWideShowMore({
  shown,
  total,
  isDesktop,
  onShowMore,
}: MarketWideShowMoreProps) {
  const { t } = useTranslation();
  const remaining = total - shown;
  if (remaining <= 0) return null;
  return (
    // A full-width bar under the cards; beside the count with a pointer.
    <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center lg:justify-between">
      <p className="text-center text-[0.6875rem] text-text-dim tabular-nums lg:text-left">
        {t('industry.marketOpportunitiesShowing', { shown, total })}
      </p>
      {/* `sm` only beside the count with a pointer: alone on a phone it is a thumb target. */}
      <Button size={isDesktop ? 'sm' : undefined} onClick={onShowMore}>
        {remaining > MARKET_WIDE_PAGE_SIZE
          ? t('industry.marketOpportunitiesShowNext', { count: MARKET_WIDE_PAGE_SIZE })
          : t('industry.marketOpportunitiesShowLast', { count: remaining })}
      </Button>
    </div>
  );
}
