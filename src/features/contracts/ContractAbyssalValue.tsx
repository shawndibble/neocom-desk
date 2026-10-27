/**
 * The abyssal-module line under a public contract's price check: the
 * MutaMarket estimate for the modules that have one, never added into the hub
 * figure, and why the rest have none. An estimate of each module's exact
 * rolls, not a sale price, so it says so and credits its source.
 *
 * Neutral type, like the rest of the check: the contract does not say which
 * side the reader is on.
 */
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { MUTAMARKET_SITE_URL } from '@/market/mutamarket';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import type { AbyssalContractValue } from './abyssalValueMath';

export function ContractAbyssalValue({ value }: { value: AbyssalContractValue }) {
  const { t } = useTranslation();
  return (
    <div className="border-y border-line py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-text-dim">{t('contracts.detailAbyssalValue')}</span>
        {value.priced > 0 ? (
          <span className="tabular-nums font-semibold">
            {formatIskAuto(value.estimated, CONTRACT_ISK_CENTS_BELOW)}
            {value.unpriced > 0 && (
              <span className="ml-1.5 font-normal text-text-dim">
                {t('contracts.detailAbyssalUnpriced', { count: value.unpriced })}
              </span>
            )}
          </span>
        ) : (
          <span className="font-normal text-text-dim">{t('contracts.detailAbyssalNotPriced')}</span>
        )}
      </div>
      <p className="mt-0.5 text-[0.6875rem] text-text-dim">
        {value.priced > 0 && t('contracts.detailAbyssalEstimateNote')}
        {value.priced > 0 && value.unpriced > 0 && ' '}
        {value.unpriced > 0 && t('contracts.detailAbyssalWhy')}{' '}
        <ExternalLink href={MUTAMARKET_SITE_URL}>{t('market.mutamarket.priceFrom')}</ExternalLink>
      </p>
    </div>
  );
}
