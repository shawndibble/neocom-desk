import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { IskAmount, Tooltip } from '@/components/ui';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';
import { cx } from '@/lib/cx';
import type { BpoOffer } from './bpoAvailability';

interface BpoCardProps {
  bpo: BpoOffer;
  /** `bpoMayBeCheaper` against the cheapest comparable copy on screen. */
  mayBeCheaper: boolean;
  /** The BPO's system, `undefined` while the local lookup resolves. */
  location: OfferLocation | undefined;
  className?: string;
}

/**
 * One blueprint original for sale, as a card inline with Cheapest by region
 * (issue #1241) — said once for the picked blueprint rather than on every copy
 * row. Its group header ("Market BPOs" / "Contract BPOs") names the source, so
 * the card carries only a short "BPO" cue; that written cue sets it apart from
 * the region cells and the accent tint only reinforces it (DESIGN.md §7).
 * Placed by system + security alone, the Item Offers location lookup.
 */
export function BpoCard({ bpo, mayBeCheaper, location, className }: BpoCardProps) {
  const { t } = useTranslation();
  const detail =
    bpo.kind === 'market'
      ? t('bpcContracts.bpoCardNpcSeeded')
      : t('bpcContracts.bpoMeTe', { me: bpo.me, te: bpo.te });

  return (
    <li
      className={cx(
        'flex min-w-0 flex-col gap-0.5 rounded-xs border border-accent-dim bg-accent/10 px-2.5 py-2',
        className
      )}
    >
      {/* Wraps rather than clips: the signal must read whole in a narrow card. */}
      {mayBeCheaper ? (
        <Tooltip content={t('bpcContracts.bpoCardMayBeCheaperHint')} openOnTap>
          <button
            type="button"
            className="min-w-0 rounded-xs text-left text-[0.6875rem] leading-tight font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t('bpcContracts.bpoMayBeCheaper')}
          </button>
        </Tooltip>
      ) : (
        <span className="truncate text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
          {t('bpcContracts.bpoCardCue')}
        </span>
      )}
      <span className="text-sm tabular-nums">
        <IskAmount value={bpo.price} revealOn="tap" />
      </span>
      {/* Missing entry: still resolving. Null system: a player structure. */}
      <span className="truncate text-[0.6875rem] text-text-dim">
        {location === undefined ? (
          t('bpcContracts.locationResolving')
        ) : location.systemName === null ? (
          t('bpcContracts.notApplicable')
        ) : (
          <>
            {location.systemName}
            {location.security !== null && (
              <>
                {' '}
                <SecurityStatus security={location.security} />
              </>
            )}
          </>
        )}
      </span>
      <span className="truncate text-[0.6875rem] text-text-dim">{detail}</span>
    </li>
  );
}
