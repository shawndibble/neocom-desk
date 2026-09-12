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
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StatChip } from '@/components/ui';
import { formatIsk, formatIskAuto } from '@/lib/isk';
import { formatMagnitude } from '@/lib/magnitude';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import {
  courierCollateral,
  type CourierEndpoint,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';
import { collateralToRewardRatio, iskPerVolume } from '@/engine/contracts/courierRates';
import { courierRisks, type CourierRiskKind } from '@/engine/contracts/courierRisk';
import { communityFloorReward, paysFarAboveGoingRate } from '@/engine/contracts/courierGoingRate';
import {
  forcesFreighter,
  hoursToExpiry,
  FREIGHTER_VOLUME_M3,
} from '@/engine/contracts/courierRisk';
import { routeExposure, type RouteExposure } from '@/features/contractSearch/routeExposure';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { MARKED_RISKS, RISK_COPY } from '@/features/contractSearch/courierRiskLabels';

export interface CourierContractDetailModalProps {
  row: CourierRouteRow;
  regionNames: ReadonlyMap<number, string>;
  /**
   * This haul's distance: a count, `null` where the board measured and found
   * none, or `'pending'` while the pass is still running. The third state
   * matters — "still measuring" must not be reported as "no rate available".
   */
  jumps: number | 'pending' | null;
  /** How far above the corpus median it pays, or `null` where that cannot be stated. */
  goingRateMultiple: number | null;
  /** Which route the board is measuring, so the exposure below counts the same one. */
  preference: RoutePreferenceKind;
  onClose: () => void;
}

/**
 * The systems this haul is flown through at 0.5 or below, resolved when the
 * detail opens — one route on demand, never one per row. `null` while it is
 * still being worked out, which is a different thing from having no answer.
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

function endpointName(endpoint: CourierEndpoint): string {
  return endpoint.name ?? `#${endpoint.locationId}`;
}

function endpointLine(endpoint: CourierEndpoint, regionNames: ReadonlyMap<number, string>): string {
  if (endpoint.regionId == null) return endpointName(endpoint);
  const region = regionNames.get(endpoint.regionId) ?? `#${endpoint.regionId}`;
  return `${endpointName(endpoint)} (${region})`;
}

export function CourierContractDetailModal({
  row,
  regionNames,
  jumps,
  goingRateMultiple,
  preference,
  onClose,
}: CourierContractDetailModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const collateral = courierCollateral(row);
  const volumeRate = iskPerVolume(row.reward, row.volume);
  const collateralRatio = collateralToRewardRatio(collateral, row.reward);
  // Spelled out here, where the decision is actually made — the row only has
  // room for a marker. Every one names a condition and what it would cost;
  // none claims to know whether this player in particular has access.
  const endpointRisks = courierRisks(row);
  // Contract-scoped rather than endpoint-scoped, so it is added here rather
  // than derived from the two ends (issue #946).
  const risks: CourierRiskKind[] = paysFarAboveGoingRate(goingRateMultiple)
    ? [...endpointRisks, 'over-rate']
    : endpointRisks;
  const exposure = useRouteExposure(row, preference);
  const measuring = jumps === 'pending';
  const floor = measuring ? null : communityFloorReward(collateral, jumps);
  // Pinned to when the detail opened rather than read each render: a figure
  // that ticks while the reader looks at it is a moving target, and "as of
  // when you opened this" is the honest reading of a countdown anyway.
  const [openedAt] = useState(() => Date.now());
  const expiresIn = hoursToExpiry(row.dateExpired, openedAt);
  // A nullsec end is a note, not an alarm. Heading a section of nothing but
  // notes with a warning-coloured "Before you accept" would contradict the
  // sentence underneath it, which says outright that it is not a warning.
  const warns = risks.some((kind) => MARKED_RISKS.includes(kind));

  return (
    <Modal
      open
      onClose={onClose}
      title={`${endpointName(row.origin)} → ${endpointName(row.destination)}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label={t('contractSearch.rewardColumn')} value={formatIsk(row.reward, 2)} />
          <StatChip
            label={t('contractSearch.collateralColumn')}
            value={collateral === 0 ? '—' : formatIsk(collateral, 2)}
          />
          <StatChip
            label={t('contractSearch.volumeColumn')}
            value={`${formatMagnitude(row.volume)} m³`}
          />
          <StatChip
            label={t('contractSearch.daysColumn')}
            value={row.daysToComplete == null ? '—' : String(row.daysToComplete)}
          />
          <StatChip
            label={t('contractSearch.iskPerVolumeColumn')}
            value={volumeRate === null ? '—' : formatIskAuto(volumeRate)}
          />
          {/*
           * Here rather than as a column: both raw figures already sit side
           * by side in the table, and the max-collateral filter is where the
           * concern is acted on.
           */}
          <StatChip
            label={t('contractSearch.collateralRatioLabel')}
            value={
              // A haul asking no collateral says so the same way the chip
              // beside it does. "0x" is arithmetically true and reads as a
              // measured ratio, which is the opposite of "none was asked for".
              collateralRatio === null || collateral === 0
                ? '—'
                : t('contractSearch.collateralRatioValue', {
                    ratio: formatMagnitude(collateralRatio),
                  })
            }
          />
        </div>

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
                {t('contractSearch.communityFloorActual', { reward: formatIskAuto(row.reward) })}
              </li>
            )}
            {/*
              The fourth signal, beside the other three rather than stranded in
              the chip row above: a large collateral against a small reward is
              the shape of a contract designed to be uncompletable.
            */}
            {collateralRatio !== null && collateral > 0 && (
              <li>
                {t('contractSearch.collateralRatioAgainstReward', {
                  ratio: formatMagnitude(collateralRatio),
                })}
              </li>
            )}
            {forcesFreighter(row.volume) && (
              <li
                // Warning-toned only where it is actually the ganking shape:
                // the ticket's bait is an oversized load *on a lowsec route*.
                // A 400,000 m³ Jita-to-Perimeter haul is a freighter job, which
                // is worth stating and is not a warning.
                className={
                  exposure?.kind === 'known' && exposure.exposedSystems > 0 ? 'text-warning' : ''
                }
              >
                {t('contractSearch.freighterVolumeNote', {
                  volume: formatMagnitude(FREIGHTER_VOLUME_M3),
                })}
              </li>
            )}
            {/*
              Said either way: silence for a clean route reads the same as
              silence for a route we could not work out, and the rule on this
              surface is to state what is not in the figure.
            */}
            {exposure?.kind === 'known' && exposure.chokepoints.length > 0 && (
              <li className="text-warning">
                {t('contractSearch.routeExposureChokepoints', {
                  systems: exposure.chokepoints.join(', '),
                })}
              </li>
            )}
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

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-text-dim">{t('contractSearch.originLabel')}</dt>
          <dd className="truncate">{endpointLine(row.origin, regionNames)}</dd>
          <dt className="text-text-dim">{t('contractSearch.destinationLabel')}</dt>
          <dd className="truncate">{endpointLine(row.destination, regionNames)}</dd>
          <dt className="text-text-dim">{t('contractDetail.expiresLabel')}</dt>
          <dd className="tabular-nums">{formatTimestamp(new Date(row.dateExpired), timeZone)}</dd>
          <dt className="text-text-dim">{t('contractDetail.contractIdLabel')}</dt>
          <dd className="tabular-nums">{row.contractId}</dd>
        </dl>
      </div>
    </Modal>
  );
}
