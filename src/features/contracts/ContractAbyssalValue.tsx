import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { MUTAMARKET_SITE_URL } from '@/market/mutamarket';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { AbyssalContractValue } from './abyssalValueMath';

export function ContractAbyssalValue({
  value,
  abyssalOnly,
  onToggleAbyssalOnly,
}: {
  value: AbyssalContractValue;
  abyssalOnly?: boolean;
  onToggleAbyssalOnly?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-y border-line py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-text-dim">
          {t('contracts.detailAbyssalValue')}
          <InfoTooltip
            glyph="info"
            label={t('contracts.detailAbyssalInfoLabel')}
            content={t('contracts.detailAbyssalInfo')}
          />
        </span>
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
        {value.unpriced > 0 && `${t('contracts.detailAbyssalWhy')} `}
        <ExternalLink href={MUTAMARKET_SITE_URL}>{t('contracts.detailAbyssalSource')}</ExternalLink>
      </p>
      {onToggleAbyssalOnly && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={onToggleAbyssalOnly}
            className={`${inlineLinkClassName} inline-flex min-h-9 items-center md:min-h-0`}
          >
            {abyssalOnly ? t('contracts.detailShowAllItems') : t('contracts.detailShowAbyssalOnly')}
          </button>
        </div>
      )}
    </div>
  );
}
