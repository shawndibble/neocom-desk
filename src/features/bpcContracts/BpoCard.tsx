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
  /** `bpoMayBeCheaper` against the cheapest comparable copy on screen. */
  mayBeCheaper: boolean;
  /** The cheapest box in the whole Cheapest by region / BPO row — the only one that gets the accent. */
  cheapest: boolean;
  /** The BPO's system, `undefined` while the local lookup resolves. */
  location: OfferLocation | undefined;
  className?: string;
}

/**
 * One blueprint original for sale, as a card inline with Cheapest by region
 * (issue #1241) — said once for the picked blueprint rather than on every copy
 * row. Its group header ("Market BPOs" / "Contract BPOs") names the source, so
 * the card carries no cue line of its own and stays as tall as a region cell;
 * styled exactly like one — the accent only when it is the cheapest box in
 * the row (`cheapestSourcingCard`), never just for being a BPO.
 * Placed by system + security alone, the Item Offers location lookup.
 */
export function BpoCard({ bpo, mayBeCheaper, cheapest, location, className }: BpoCardProps) {
  const { t } = useTranslation();
  // A market BPO always sells unresearched (ME0/TE0), so only a contract
  // original names its research ("10/20", the full wording on hover). That and
  // the market's NPC-seeded caveat ride the existing lines, so the card stays
  // two lines, as tall as a region cell.
  const meTe = bpo.kind === 'contract' ? { me: bpo.me, te: bpo.te } : null;

  return (
    <li
      className={cx(
        'flex min-w-0 flex-col gap-0.5 rounded-xs border bg-panel-2 px-2.5 py-2',
        cheapest ? 'border-accent-dim' : 'border-line',
        className
      )}
    >
      {/* Same three lines as a region card. "May be cheaper" rides on the
          price line — accent, like Cheapest by region's cheapest cell — with
          its hint behind an info icon, rather than adding a fourth line. */}
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
      {/* Missing entry: still resolving. Null system: a player structure. */}
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
