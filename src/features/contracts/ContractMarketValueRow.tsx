/**
 * The market-value figure under a contract's item list (issue #717): what the
 * bundle costs to buy outright at a Trade Hub right now, so a reader can hold
 * the asking price against it.
 *
 * Neutral color, never `isk-pos`/`isk-neg` — those tokens signal a gain or a
 * loss *to this character*, and a contract alone doesn't say which side of it
 * the reader would be on. Coloring the number either way would be a wrong
 * signal, not just a missing one.
 *
 * Shared by both contract detail modals — the character-scoped one and the
 * public one — because the figure means the same thing on either.
 *
 * Abyssal modules have no market price, so they get a line of their own: the
 * MutaMarket estimate for those that have one, never added into the market
 * figure, and why the rest have none.
 */
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { MUTAMARKET_SITE_URL } from '@/market/mutamarket';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import type {
  AbyssalContractValue,
  ContractMarketValue,
} from '@/features/character/contractMarketValue';

export function ContractMarketValueRow({
  value,
  hubName,
}: {
  value: ContractMarketValue;
  hubName: string;
}) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  // Every line failed to price because the source was unreachable: "0 ISK
  // (+N unpriced)" would read as a real, worthless bundle.
  const unavailable = value.unreachable && value.total === 0 && value.unpriced > 0;
  const abyssal = value.abyssal && <AbyssalValueRows value={value.abyssal} />;
  if (value.abyssal?.onlyAbyssal) return abyssal;
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5">
        <span className="text-text-dim">{t('contracts.detailMarketValue', { hub: hubName })}</span>
        {unavailable ? (
          <span className="font-normal text-text-dim">{pricesUnavailableLabel}</span>
        ) : (
          <span className="tabular-nums font-semibold">
            {formatIskAuto(value.total, CONTRACT_ISK_CENTS_BELOW)}
            {value.unpriced > 0 && (
              <span className="ml-1.5 font-normal text-text-dim">
                {t('contracts.detailMarketValueUnpriced', { count: value.unpriced })}
              </span>
            )}
          </span>
        )}
      </div>
      {abyssal}
    </>
  );
}

function AbyssalValueRows({ value }: { value: AbyssalContractValue }) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-line py-1.5">
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
