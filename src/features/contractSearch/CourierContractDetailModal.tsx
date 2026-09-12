/**
 * Full detail for one public courier contract, opened from a row in the
 * Courier half of Contracts Search's Search tab.
 *
 * Unlike `PublicContractDetailModal` (item_exchange/auction contracts), a
 * courier haul has no item list — ESI's public items route only ever answers
 * for the two contract types that actually carry one — and no single
 * location, only an origin and a destination. So this is its own, simpler
 * modal rather than a shared one: every field it shows is already resolved on
 * `CourierRouteRow` (`resolveCourierRoutes`, local SDE snapshots only), so
 * unlike its sibling it needs no fetch of its own and never shows a loading
 * state.
 *
 * Laid out in three registers rather than one strip of equal chips (issue
 * #975). A hauler decides on two figures — what it pays, and what it pays per
 * jump, which is what the board itself ranks on — so those lead at display
 * size. The route comes next, because the names are long and a truncated
 * region hides the one fact the row could not already show. Everything else
 * is a constraint to check rather than a figure to weigh, and sits in one
 * quiet grid below.
 */
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { formatIsk, formatIskAuto, formatIskCompact } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import {
  courierCollateral,
  type CourierEndpoint,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';
import { collateralToRewardRatio, iskPerJump, iskPerVolume } from '@/engine/contracts/courierRates';
import { courierRisks } from '@/engine/contracts/courierRisk';
import { endpointName, endpointSystemName } from '@/features/contractSearch/courierEndpointNames';
import { MARKED_RISKS, RISK_COPY } from '@/features/contractSearch/courierRiskLabels';

/**
 * One decimal, for a figure read as a magnitude rather than an exact amount —
 * a hold is "60,000 m³" and a collateral is "40x the reward"; further digits
 * imply a precision neither carries.
 */
const MAGNITUDE_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

/**
 * This haul's distance, in the states the board itself has.
 *
 * `pending` is the jump snapshot still being read, which must not render as
 * "no route" — that is a confident wrong answer where the honest one is "we
 * cannot say yet". A known `null` count is the two cases the table also folds
 * together: an endpoint nothing local places, and a system no stargate
 * reaches. Neither yields a distance, and the modal says so the same way.
 */
export type CourierJumps = { kind: 'pending' } | { kind: 'known'; count: number | null };

export interface CourierContractDetailModalProps {
  row: CourierRouteRow;
  regionNames: ReadonlyMap<number, string>;
  /** Resolved by the board, which already holds the graph read for every row. */
  jumps: CourierJumps;
  onClose: () => void;
}

/** Where this end sits, as one dim line: system, region, space band. */
function endpointPlace(
  endpoint: CourierEndpoint,
  regionNames: ReadonlyMap<number, string>,
  unknownSpace: string,
  spaceLabel: (space: string) => string,
  structureLabel: string
): string {
  const parts: string[] = [];
  // A structure names itself before anything else: its bare id is the line
  // above, and "#1039…" alone does not say *why* there is no name.
  if (endpoint.resolution === 'structure') parts.push(structureLabel);
  if (endpoint.systemName !== null) parts.push(endpoint.systemName);
  if (endpoint.regionId !== null) {
    parts.push(regionNames.get(endpoint.regionId) ?? `#${endpoint.regionId}`);
  }
  parts.push(endpoint.space === null ? unknownSpace : spaceLabel(endpoint.space));
  return parts.join(' · ');
}

/** Label over value, the shape every figure below the hero takes. */
function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
      {note !== undefined && <span className="text-[0.6875rem] text-text-dim">{note}</span>}
    </div>
  );
}

export function CourierContractDetailModal({
  row,
  regionNames,
  jumps,
  onClose,
}: CourierContractDetailModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const collateral = courierCollateral(row);
  const volumeRate = iskPerVolume(row.reward, row.volume);
  const collateralRatio = collateralToRewardRatio(collateral, row.reward);
  const jumpCount = jumps.kind === 'known' ? jumps.count : null;
  const jumpRate = jumps.kind === 'known' ? iskPerJump(row.reward, jumpCount) : null;
  // Spelled out here, where the decision is actually made — the row only has
  // room for a marker. Every one names a condition and what it would cost;
  // none claims to know whether this player in particular has access.
  const risks = courierRisks(row);
  // A nullsec end is a note, not an alarm. Heading a section of nothing but
  // notes with a warning-coloured "Before you accept" would contradict the
  // sentence underneath it, which says outright that it is not a warning.
  const warns = risks.some((kind) => MARKED_RISKS.includes(kind));

  const place = (endpoint: CourierEndpoint) =>
    endpointPlace(
      endpoint,
      regionNames,
      t('contractSearch.spaceUnknown'),
      (space) => t(`common.spaceOption.${space}`),
      t('contractSearch.playerStructureShort')
    );

  /**
   * The exact rate and what it is quoted over, under the compact figure —
   * the same pairing the reward gets. Compact notation rounds to one fraction
   * digit, so two hauls paying 1,240,000 and 1,190,000 per jump both read
   * "1.2M"; this is where the figure a hauler actually compares on lives.
   */
  const jumpSpan = () => {
    if (jumps.kind === 'pending') return t('common.loading');
    if (jumpCount === null || jumpRate === null) return t('contractSearch.jumpsUnavailableHint');
    // A same-system haul is a real job with no trip, and `iskPerJump` pays it
    // its whole reward as the rate. "over 0 jumps" would read as a division
    // nobody made.
    if (jumpCount === 0) {
      return t('contractSearch.sameSystemSpan', { isk: formatIsk(jumpRate) });
    }
    return t('contractSearch.jumpRateSpan', { isk: formatIsk(jumpRate), count: jumpCount });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('contractSearch.courierModalTitle', {
        origin: endpointSystemName(row.origin),
        destination: endpointSystemName(row.destination),
      })}
    >
      <div className="flex flex-col gap-3">
        {/*
         * Reward and ISK/jump at display size, side by side. ISK/jump is the
         * board's own default sort and was absent from this modal entirely —
         * a hauler could rank on it in the table and then lose it on the one
         * screen where the decision is made.
         */}
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('contractSearch.rewardColumn')}
            </span>
            <span className="text-2xl leading-tight font-semibold tabular-nums">
              {formatIskCompact(row.reward)}
            </span>
            <span className="text-[0.6875rem] text-text-dim tabular-nums">
              {t('contractSearch.rewardOnDelivery', { isk: formatIsk(row.reward) })}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('contractSearch.perJumpLabel')}
            </span>
            <span
              // Accent marks the figure the board ranks on, so it is spent
              // only where there is a rate to rank: a free haul's honest zero
              // and an unmeasurable route both read as quiet.
              className={`text-2xl leading-tight font-semibold tabular-nums ${
                jumpRate ? 'text-accent' : 'text-text-dim'
              }`}
            >
              {jumpRate === null ? '—' : formatIskCompact(jumpRate)}
            </span>
            <span className="text-[0.6875rem] text-text-dim">{jumpSpan()}</span>
          </div>
        </div>

        <section className="flex flex-col gap-2 rounded-xs border border-line bg-panel-2 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('contractSearch.pickUpLabel')}
            </span>
            {/* Wraps rather than truncates: the station name and its region
                are the whole reason this row exists, and the old `truncate`
                clipped the region off both ends. */}
            <span className="text-sm">{endpointName(row.origin)}</span>
            <span className="text-[0.6875rem] text-text-dim">{place(row.origin)}</span>
          </div>

          <div className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
            <span aria-hidden className="h-4 w-px bg-line" />
            <span className="tabular-nums">
              {jumps.kind === 'pending'
                ? t('common.loading')
                : jumpCount === null
                  ? t('contractSearch.jumpsUnknownLabel')
                  : t('contractSearch.jumpsShort', { count: jumpCount })}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('contractSearch.dropOffLabel')}
            </span>
            <span className="text-sm">{endpointName(row.destination)}</span>
            <span className="text-[0.6875rem] text-text-dim">{place(row.destination)}</span>
          </div>
        </section>

        {risks.length > 0 && (
          <section className="flex flex-col gap-1.5 rounded-xs border border-line bg-panel-2 p-3">
            <h3
              className={`text-[0.6875rem] font-semibold tracking-widest uppercase ${
                warns ? 'text-warning' : 'text-text-dim'
              }`}
            >
              {t(warns ? 'contractSearch.riskHeading' : 'contractSearch.riskNoteHeading')}
            </h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {risks.map((kind) => (
                <li key={kind}>
                  <span className="text-text-dim">{t(RISK_COPY[kind].short)}</span>
                  {' — '}
                  {t(RISK_COPY[kind].detail)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
         * Constraints rather than figures to weigh: whether the hold fits,
         * whether the deadline is long enough, and the two ids. One quiet
         * grid, so nothing here competes with the two figures above.
         */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm sm:grid-cols-3">
          <Figure
            label={t('contractSearch.collateralColumn')}
            // A haul asking no collateral says so the same way the table cell
            // does. "0 ISK" is arithmetically true and reads as a figure the
            // issuer typed, which is the opposite of "none was asked for".
            value={collateral === 0 ? '—' : formatIskCompact(collateral)}
            note={
              collateral === 0
                ? t('contractSearch.noCollateralNote')
                : collateralRatio === null
                  ? undefined
                  : t('contractSearch.collateralRatioNote', {
                      ratio: MAGNITUDE_FORMAT.format(collateralRatio),
                    })
            }
          />
          <Figure
            label={t('contractSearch.volumeColumn')}
            value={t('contractSearch.volumeValue', {
              volume: MAGNITUDE_FORMAT.format(row.volume),
            })}
            note={
              volumeRate === null
                ? undefined
                : t('contractSearch.iskPerVolumeNote', { rate: formatIskAuto(volumeRate) })
            }
          />
          <Figure
            label={t('contractSearch.timeToDeliverLabel')}
            value={
              row.daysToComplete == null
                ? '—'
                : t('contractSearch.daysValue', { count: row.daysToComplete })
            }
            note={row.daysToComplete == null ? undefined : t('contractSearch.onceAcceptedNote')}
          />
          <Figure
            label={t('contractSearch.listingExpiresLabel')}
            value={formatTimestamp(new Date(row.dateExpired), timeZone)}
          />
          <Figure label={t('contractDetail.contractIdLabel')} value={String(row.contractId)} />
        </div>
      </div>
    </Modal>
  );
}
