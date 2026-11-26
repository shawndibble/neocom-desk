import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { courierCollateral, type CourierRouteRow } from '@/engine/contracts/courierSearch';
import { iskPerJump, iskPerVolume } from '@/engine/contracts/courierRates';
import { paysFarAboveGoingRate } from '@/engine/contracts/courierGoingRate';
import { memoByRow } from '@/lib/memoByRow';
import { joined } from '@/lib/exportSheets';
import { exportFlag } from '@/lib/exportFlag';
import { endpointSystemName } from './courierEndpointNames';
import { markedEndpointRisks, RISK_COPY } from './courierRiskLabels';

export interface CourierCsvLookups {
  regionName: (regionId: number | null) => string | null;
  jumps: (row: CourierRouteRow) => number | null;
  goingRateMultiple: (row: CourierRouteRow) => number | null;
}

export function courierContractsCsvColumns(
  t: CsvTranslate,
  lookups: CourierCsvLookups
): CsvColumn<CourierRouteRow>[] {
  const multipleOf = memoByRow(lookups.goingRateMultiple);
  const riskText = (endpoint: CourierRouteRow['origin'], end: 'origin' | 'destination') => {
    const marked = markedEndpointRisks(endpoint, end);
    return marked.length === 0 ? null : joined(marked.map((kind) => t(RISK_COPY[kind].short)));
  };
  return [
    { header: t('contractSearch.pickUpLabel'), value: (row) => endpointSystemName(row.origin) },
    {
      header: t('contractSearch.originRegionLabel'),
      value: (row) => lookups.regionName(row.origin.regionId),
    },
    {
      header: t('contractSearch.dropOffLabel'),
      value: (row) => endpointSystemName(row.destination),
    },
    {
      header: t('contractSearch.destinationRegionLabel'),
      value: (row) => lookups.regionName(row.destination.regionId),
    },
    { header: t('contractSearch.rewardColumn'), value: (row) => row.reward },
    { header: t('contractSearch.collateralColumn'), value: (row) => courierCollateral(row) },
    { header: t('contractSearch.volumeColumn'), value: (row) => row.volume },
    { header: t('contractSearch.jumpsColumn'), value: (row) => lookups.jumps(row) },
    {
      header: t('contractSearch.iskPerJumpColumn'),
      value: (row) => iskPerJump(row.reward, lookups.jumps(row)),
    },
    {
      header: t('contractSearch.iskPerVolumeColumn'),
      value: (row) => iskPerVolume(row.reward, row.volume),
    },
    {
      header: t('contractSearch.expiresColumn'),
      value: (row) => new Date(row.dateExpired).toISOString(),
    },
    { header: t('contractSearch.originSecurityColumn'), value: (row) => row.origin.security },
    {
      header: t('contractSearch.destinationSecurityColumn'),
      value: (row) => row.destination.security,
    },
    {
      header: t('contractSearch.originRiskColumn'),
      value: (row) => riskText(row.origin, 'origin'),
    },
    {
      header: t('contractSearch.destinationRiskColumn'),
      value: (row) => riskText(row.destination, 'destination'),
    },
    {
      header: t('contractSearch.rateMultipleColumn'),
      value: (row) => multipleOf(row),
    },
    {
      header: t('contractSearch.overRateColumn'),
      value: (row) => {
        const multiple = multipleOf(row);
        return multiple === null ? null : exportFlag(t, paysFarAboveGoingRate(multiple));
      },
    },
  ];
}
