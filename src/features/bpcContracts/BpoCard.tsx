import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { InfoTooltip, IskAmount } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { SystemLink } from '@/features/entities';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';
import { cx } from '@/lib/cx';
import type { BpoOffer } from './bpoAvailability';

interface BpoCardProps {
  bpo: BpoOffer;
  mayBeCheaper: boolean;
  cheapest: boolean;
  location: OfferLocation | undefined;
  className?: string;
}

export function BpoCard({ bpo, mayBeCheaper, cheapest, location, className }: BpoCardProps) {
  const { t } = useTranslation();
  const meTe = bpo.kind === 'contract' ? { me: bpo.me, te: bpo.te } : null;

  return (
    <li
      className={cx(
        'flex min-w-0 flex-col gap-0.5 rounded-xs border bg-panel-2 px-2.5 py-2',
        cheapest ? 'border-accent-dim' : 'border-line',
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-1">
        <IskAmount
          value={bpo.price}
          className={cx('text-sm tabular-nums', cheapest && 'text-accent')}
        />
        {bpo.kind === 'market' && (
          <InfoTooltip
            label={t('bpcContracts.bpoCardNpcSeededLabel')}
            content={t('bpcContracts.bpoCardNpcSeededHint')}
          />
        )}
        {mayBeCheaper && (
          <InfoTooltip
            label={t('bpcContracts.bpoMayBeCheaper')}
            content={t('bpcContracts.bpoCardMayBeCheaperHint')}
            tone="accent"
          />
        )}
      </span>
      <span className="flex min-w-0 items-baseline gap-1 text-[0.6875rem] text-text-dim">
        <span className="min-w-0 truncate">
          {location === undefined ? (
            t('bpcContracts.locationResolving')
          ) : location.systemName === null ? (
            t('bpcContracts.notApplicable')
          ) : (
            <>
              {location.systemId !== null ? (
                <SystemLink systemId={location.systemId}>{location.systemName}</SystemLink>
              ) : (
                location.systemName
              )}
              {location.security !== null && (
                <>
                  {' '}
                  <SecurityStatus security={location.security} />
                </>
              )}
            </>
          )}
        </span>
        {meTe !== null && (
          <>
            <span aria-hidden>·</span>
            <HintText
              className="shrink-0 whitespace-nowrap"
              content={t('bpcContracts.bpoMeTe', meTe)}
            >
              {t('bpcContracts.bpoMeTeShort', meTe)}
            </HintText>
          </>
        )}
      </span>
    </li>
  );
}
