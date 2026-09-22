import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { IskAmount, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
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
 * the card carries no cue line of its own and stays as tall as a region cell;
 * the accent tint only reinforces the header (DESIGN.md §7).
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
      {/* Same three lines as a region card. "May be cheaper" rides on the
          price line — accent, like Cheapest by region's cheapest cell — with
          its hint behind an info icon, rather than adding a fourth line. */}
      <span className="flex min-w-0 items-center gap-1">
        <IskAmount
          value={bpo.price}
          revealOn="tap"
          className={cx('text-sm tabular-nums', mayBeCheaper && 'text-accent')}
        />
        {mayBeCheaper && (
          <Tooltip content={t('bpcContracts.bpoCardMayBeCheaperHint')} openOnTap>
            <button
              type="button"
              aria-label={t('bpcContracts.bpoMayBeCheaper')}
              className="rounded-xs text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Icon.Info aria-hidden />
            </button>
          </Tooltip>
        )}
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
