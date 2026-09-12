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
import { useTranslation } from 'react-i18next';
import { Modal, StatChip } from '@/components/ui';
import { formatIsk, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import {
  courierCollateral,
  type CourierEndpoint,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';
import { collateralToRewardRatio, iskPerVolume } from '@/engine/contracts/courierRates';

/**
 * One decimal, for a figure read as a magnitude rather than an exact amount —
 * a hold is "60,000 m³" and a collateral is "40x the reward"; further digits
 * imply a precision neither carries.
 */
const MAGNITUDE_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export interface CourierContractDetailModalProps {
  row: CourierRouteRow;
  regionNames: ReadonlyMap<number, string>;
  onClose: () => void;
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
  onClose,
}: CourierContractDetailModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const collateral = courierCollateral(row);
  const volumeRate = iskPerVolume(row.reward, row.volume);
  const collateralRatio = collateralToRewardRatio(collateral, row.reward);

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
            value={`${MAGNITUDE_FORMAT.format(row.volume)} m³`}
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
                    ratio: MAGNITUDE_FORMAT.format(collateralRatio),
                  })
            }
          />
        </div>

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
