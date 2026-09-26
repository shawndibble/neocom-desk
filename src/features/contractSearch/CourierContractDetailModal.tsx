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
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { SecurityStatus } from '@/components/SecurityStatus';
import { formatIsk, formatIskAuto, formatIskCompact } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import {
  courierCollateral,
  type CourierEndpoint,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';
import { collateralToRewardRatio, iskPerJump, iskPerVolume } from '@/engine/contracts/courierRates';
import {
  asksFarMoreCollateralThanReward,
  courierRisks,
  forcesFreighter,
  hoursToExpiry,
  FREIGHTER_VOLUME_M3,
  type CourierRiskKind,
} from '@/engine/contracts/courierRisk';
import {
  communityFloorReward,
  floorShare,
  paysFarAboveGoingRate,
} from '@/engine/contracts/courierGoingRate';
import { routeExposure, type RouteExposure } from '@/features/contractSearch/routeExposure';
import { formatMagnitude } from '@/lib/magnitude';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { endpointName, endpointSystemName } from '@/features/contractSearch/courierEndpointNames';
import { RISK_COPY, WARNING_RISKS } from '@/features/contractSearch/courierRiskLabels';

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

/**
 * What the board found running this haul's lane backwards (issue #941).
 *
 * `unresolved` is a haul with an end nothing local places, which has no region
 * to swap and therefore no lane to look up. It is a separate state rather than
 * a count of zero on purpose: zero reads as "nobody is hauling back", and the
 * truth here is "we cannot tell".
 *
 * `unplaceable` is the return hauls leaving the right region whose own drop-off
 * cannot be placed, so the lane cannot be measured for them either. They are
 * missing from `count` by construction; saying how many keeps a small count
 * from reading as a complete one.
 */
export type ReverseLane =
  { kind: 'unresolved' } | { kind: 'counted'; count: number; unplaceable: number };

export interface CourierContractDetailModalProps {
  row: CourierRouteRow;
  regionNames: ReadonlyMap<number, string>;
  /** Resolved by the board, which already holds the graph read for every row. */
  jumps: CourierJumps;
  /** How far above the corpus median it pays, or `null` where that cannot be stated. */
  goingRateMultiple: number | null;
  /** Which route the board is measuring, so the exposure below counts the same one. */
  preference: RoutePreferenceKind;
  /** The return leg, resolved by the board — it holds the corpus and the filter. */
  reverseLane: ReverseLane;
  /** Swap the two region filters and go look, closing this. */
  onSearchReverseLane: () => void;
  onClose: () => void;
}

/**
 * The systems this haul is flown through at 0.5 or below, and which of them are
 * the ones haulers are most often killed in — resolved when the detail opens.
 * One route on demand, never one per row: a path per row is the fan-out the
 * local snapshots exist to avoid, and this is where a hauler is deciding.
 *
 * `null` while it is still being worked out, which is a different thing from
 * having no answer.
 */
function useRouteExposure(
  row: CourierRouteRow,
  preference: RoutePreferenceKind
): RouteExposure | null {
  const [exposure, setExposure] = useState<RouteExposure | null>(null);
  const originSystemId = row.origin.systemId;
  const destinationSystemId = row.destination.systemId;

  useEffect(() => {
    let cancelled = false;
    void routeExposure(originSystemId, destinationSystemId, preference)
      .catch((): RouteExposure => ({ kind: 'unknown' }))
      .then((result) => {
        if (!cancelled) setExposure(result);
      });
    return () => {
      cancelled = true;
    };
  }, [originSystemId, destinationSystemId, preference]);

  return exposure;
}

/**
 * Where this end sits, as one dim line: system and its security status, then
 * region — "Jita 0.9 · The Forge".
 *
 * The number rather than the space band word, the same as the board's route
 * cell: "Highsec" tells a 0.5 gank system and a 1.0 core system apart not at
 * all, and the number carries the band anyway. An end with no security (a
 * system nothing local places) prints none rather than an "unknown" — the
 * structure label and the bare id above already say why it is unplaced.
 */
function EndpointPlace({
  endpoint,
  regionNames,
  structureLabel,
}: {
  endpoint: CourierEndpoint;
  regionNames: ReadonlyMap<number, string>;
  structureLabel: string;
}) {
  const parts: ReactNode[] = [];
  // A structure names itself before anything else: its bare id is the line
  // above, and "#1039…" alone does not say *why* there is no name.
  if (endpoint.resolution === 'structure') parts.push(structureLabel);
  if (endpoint.systemName !== null || endpoint.security !== null) {
    parts.push(
      <>
        {endpoint.systemName}
        {endpoint.systemName !== null && endpoint.security !== null && ' '}
        {endpoint.security !== null && <SecurityStatus security={endpoint.security} />}
      </>
    );
  }
  if (endpoint.regionId !== null) {
    parts.push(regionNames.get(endpoint.regionId) ?? `#${endpoint.regionId}`);
  }
  return (
    <span className="text-[0.6875rem] text-text-dim">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

/** Label over value, the shape every figure below the hero takes. */
function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
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
  goingRateMultiple,
  preference,
  reverseLane,
  onSearchReverseLane,
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
  const endpointRisks = courierRisks(row);
  // Contract-scoped rather than endpoint-scoped, so they are added here rather
  // than derived from the two ends (issues #946, #1720).
  const risks: CourierRiskKind[] = [
    ...endpointRisks,
    ...(paysFarAboveGoingRate(goingRateMultiple) ? (['over-rate'] as const) : []),
    ...(asksFarMoreCollateralThanReward(collateralRatio) ? (['high-collateral'] as const) : []),
  ];
  const exposure = useRouteExposure(row, preference);
  // Where the return hauls set out from, which is this haul's drop-off region.
  // Narrowed at the render site rather than defaulted to a blank here: a lane
  // is only counted when both ends have a region, so there is no honest empty
  // case to write — only an unnamed one, which shows its id.
  const returnRegionId = row.destination.regionId;
  const measuring = jumps.kind === 'pending';
  const floor = measuring ? null : communityFloorReward(collateral, jumpCount);
  // Said as a share only when short of the floor — the case where two bare
  // figures side by side read as unrelated to the multiple above (#1720).
  const shareOfFloor = floorShare(row.reward, floor);
  const belowFloor = shareOfFloor !== null && shareOfFloor < 1;
  // Pinned to when the detail opened rather than read each render: a figure
  // that ticks while the reader looks at it is a moving target, and "as of
  // when you opened this" is the honest reading of a countdown anyway.
  const [openedAt] = useState(() => Date.now());
  const expiresIn = hoursToExpiry(row.dateExpired, openedAt);
  // A nullsec end is a note, not an alarm. Heading a section of nothing but
  // notes with a warning-coloured "Before you accept" would contradict the
  // sentence underneath it, which says outright that it is not a warning.
  const warns = risks.some((kind) => WARNING_RISKS.includes(kind));

  const regionName = (regionId: number) => regionNames.get(regionId) ?? `#${regionId}`;

  const place = (endpoint: CourierEndpoint) => (
    <EndpointPlace
      endpoint={endpoint}
      regionNames={regionNames}
      structureLabel={t('contractSearch.playerStructureShort')}
    />
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
            <span className="text-xl leading-tight font-semibold tabular-nums">
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
              className={`text-3xl leading-tight font-semibold tabular-nums ${
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
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('contractSearch.pickUpLabel')}
            </span>
            {/* Wraps rather than truncates: the station name and its region
                are the whole reason this row exists, and the old `truncate`
                clipped the region off both ends. */}
            <span className="text-sm">{endpointName(row.origin)}</span>
            {place(row.origin)}
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
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('contractSearch.dropOffLabel')}
            </span>
            <span className="text-sm">{endpointName(row.destination)}</span>
            {place(row.destination)}
          </div>

          {/*
            The way home, as one line rather than a nested table. At this corpus
            size — every public courier contract in New Eden, under 620 rows —
            the reverse set for a given region pair is typically none or one, so
            a table would exist to render "none" most of the time, and would owe
            a row cap, an empty state and a second unresolved-endpoint note for
            the privilege. A count that is also the link needs none of that.

            Region to region, which is coarse: "somewhere in Domain" is not
            necessarily near where this load is dropped. It is a prompt to go
            look, not a matched return trip.
          */}
          <div className="flex flex-col gap-1 border-t border-line pt-2 text-xs">
            {reverseLane.kind === 'unresolved' ? (
              <span className="text-text-dim">{t('contractSearch.reverseLaneUnresolved')}</span>
            ) : reverseLane.count > 0 ? (
              // `-my-2.5` cancels `min-h-11`'s added height so the section doesn't grow — the 44px only exists as invisible hit area bleeding into the border-t/pt-2 gap above and the section's own p-3 below; `md:` reverts both so desktop is unchanged.
              <button
                type="button"
                onClick={onSearchReverseLane}
                className={`-my-2.5 flex min-h-11 items-center self-start py-1 md:my-0 md:min-h-0 ${inlineLinkClassName}`}
              >
                {t('contractSearch.reverseLaneCount', { count: reverseLane.count })}
              </button>
            ) : (
              // Plain text, never a button: a control that leads to an empty
              // board is a dead link whether or not it is disabled. Said in one
              // sentence when there are unplaceable hauls behind it, because
              // "none" followed by "N *more*" is more than none.
              <span className="text-text-dim">
                {reverseLane.unplaceable > 0 && returnRegionId !== null
                  ? t('contractSearch.reverseLaneNoneUnplaceable', {
                      count: reverseLane.unplaceable,
                      region: regionName(returnRegionId),
                    })
                  : t('contractSearch.reverseLaneNone')}
              </span>
            )}
            {reverseLane.kind === 'counted' &&
              reverseLane.count > 0 &&
              reverseLane.unplaceable > 0 &&
              returnRegionId !== null && (
                <span className="text-text-dim">
                  {t('contractSearch.reverseLaneUnplaceable', {
                    count: reverseLane.unplaceable,
                    region: regionName(returnRegionId),
                  })}
                </span>
              )}
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
                  {t(RISK_COPY[kind].detail, {
                    multiple: goingRateMultiple === null ? '' : formatMagnitude(goingRateMultiple),
                    ratio: collateralRatio === null ? '' : formatMagnitude(collateralRatio),
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          What the rate multiple is measured against, and the conditions the
          documented ganking shape travels with. Every line is arithmetic over
          the snapshot: none of it says the contract is a scam, because nothing
          here can know that — the app cannot value a courier contract's cargo,
          which carries no item lines, or read anyone's intent.
        */}
        <section className="flex flex-col gap-1.5 rounded-xs border border-line bg-panel-2 p-3">
          <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('contractSearch.goingRateBenchmarkLabel')}
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            <li>
              {measuring
                ? t('contractSearch.goingRateMeasuring')
                : goingRateMultiple === null
                  ? t('contractSearch.goingRateUnavailable')
                  : t('contractSearch.goingRateAgainstCorpus', {
                      multiple: formatMagnitude(goingRateMultiple),
                    })}
            </li>
            {floor !== null && (
              <li>
                {t('contractSearch.communityFloorValue', { reward: formatIskAuto(floor) })}
                {' · '}
                {belowFloor
                  ? t('contractSearch.communityFloorShare', {
                      reward: formatIskAuto(row.reward),
                      percent: formatMagnitude(shareOfFloor * 100),
                    })
                  : t('contractSearch.communityFloorActual', { reward: formatIskAuto(row.reward) })}
                {/*
                  A high multiple beside a short floor reads as a contradiction
                  unless the two bases are named: one is cargo size, the other
                  collateral.
                */}
                {belowFloor &&
                  goingRateMultiple !== null &&
                  ` ${t('contractSearch.communityFloorVsGoingRate')}`}
              </li>
            )}
            {forcesFreighter(row.volume) && (
              <li
                // Warning-toned only where it is actually the ganking shape:
                // the bait is an oversized load *on a lowsec route*. A 400,000
                // m³ Jita-to-Perimeter haul is a freighter job, which is worth
                // stating and is not a warning.
                className={
                  exposure?.kind === 'known' && exposure.exposedSystems > 0 ? 'text-warning' : ''
                }
              >
                {t('contractSearch.freighterVolumeNote', {
                  volume: formatMagnitude(FREIGHTER_VOLUME_M3),
                })}
              </li>
            )}
            {exposure?.kind === 'known' && exposure.chokepoints.length > 0 && (
              <li className="text-warning">
                {t('contractSearch.routeExposureChokepoints', {
                  systems: exposure.chokepoints.join(', '),
                })}
              </li>
            )}
            {/*
              Said either way: silence for a clean route reads the same as
              silence for a route we could not work out, and the rule on this
              surface is to state what is not in the figure.
            */}
            <li>
              {exposure === null
                ? t('contractSearch.routeExposureMeasuring')
                : exposure.kind === 'known'
                  ? t('contractSearch.routeExposureCrossed', { count: exposure.exposedSystems })
                  : exposure.kind === 'no-route'
                    ? t('contractSearch.routeExposureNoRoute')
                    : t('contractSearch.routeExposureUnknown')}
            </li>
            <li>{t('contractSearch.expiresInHours', { hours: expiresIn })}</li>
          </ul>
        </section>

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
                      ratio: formatMagnitude(collateralRatio),
                    })
            }
          />
          <Figure
            label={t('contractSearch.volumeColumn')}
            value={t('contractSearch.volumeValue', {
              volume: formatMagnitude(row.volume),
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
