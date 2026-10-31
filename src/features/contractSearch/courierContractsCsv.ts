import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { courierCollateral, type CourierRouteRow } from '@/engine/contracts/courierSearch';
import { iskPerJump, iskPerVolume } from '@/engine/contracts/courierRates';
import { endpointRisks } from '@/engine/contracts/courierRisk';
import { paysFarAboveGoingRate } from '@/engine/contracts/courierGoingRate';
import { exportFlag } from '@/lib/exportFlag';
import { endpointSystemName } from './courierEndpointNames';
import { MARKED_RISKS, RISK_COPY } from './courierRiskLabels';

/** The board's own spellings and distances, so the export matches what is drawn. */
export interface CourierCsvLookups {
  /** `null` for an end with no region (an unplaced structure). */
  regionName: (regionId: number | null) => string | null;
  /** Jumps under the board's route preference; `null` when unknown or unreachable. */
  jumps: (row: CourierRouteRow) => number | null;
  /** How many times the market's going rate the haul pays; `null` when unstatable (no distance, volume or enough corpus). */
  goingRateMultiple: (row: CourierRouteRow) => number | null;
}

/**
 * CSV columns for the courier board. The table's Route cell folds both ends
 * and their regions into one; a spreadsheet wants them apart, so each gets a
 * column under the board's own Pick up / From region / Drop off / To region
 * labels. Figures are raw numbers; a rate with no distance to divide by is
 * blank, never 0. A haul asking no collateral is 0 (a real "none asked"). The
 * expiry is epoch ms in the row, handed on as an ISO UTC timestamp.
 */
export function courierContractsCsvColumns(
  t: CsvTranslate,
  lookups: CourierCsvLookups
): CsvColumn<CourierRouteRow>[] {
  const riskText = (endpoint: CourierRouteRow['origin'], end: 'origin' | 'destination') => {
    const marked = endpointRisks(endpoint, end).filter((kind) => MARKED_RISKS.includes(kind));
    return marked.length === 0 ? null : marked.map((kind) => t(RISK_COPY[kind].short)).join('; ');
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
    // Endpoint security, as the Route cell prints it beside each system name.
    { header: t('contractSearch.originSecurityColumn'), value: (row) => row.origin.security },
    {
      header: t('contractSearch.destinationSecurityColumn'),
      value: (row) => row.destination.security,
    },
    // The warning markers the Route cell wears beside each end.
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
      value: (row) => lookups.goingRateMultiple(row),
    },
    {
      header: t('contractSearch.overRateColumn'),
      value: (row) => {
        const multiple = lookups.goingRateMultiple(row);
        return multiple === null ? null : exportFlag(t, paysFarAboveGoingRate(multiple));
      },
    },
  ];
}
