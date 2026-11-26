import { useCallback } from 'react';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { allMembers, type DisplayRow } from '@/features/miningTax/groupRows';
import { systemLabel } from '@/features/miningTax/names';
import {
  pricesAtHubOnDate,
  sourcesAtHubOnDate,
  type DatedUnitPrices,
} from '@/features/miningTax/pricing';

export function useTaxPricing(
  datedPrices: DatedUnitPrices,
  systemNames: ReadonlyMap<number, string>,
  systemSecurity: ReadonlyMap<number, number>
) {
  const pricesFor = useCallback(
    (hubId: string | undefined, date: string): ReadonlyMap<number, number> =>
      pricesAtHubOnDate(datedPrices, hubId, date),
    [datedPrices]
  );

  const priceSourcesFor = useCallback(
    (hubId: string | undefined, date: string) => sourcesAtHubOnDate(datedPrices, hubId, date),
    [datedPrices]
  );

  const estimatedValueOf = useCallback(
    (dr: DisplayRow): number =>
      dr.assignment
        ? allMembers(dr).reduce((sum, m) => sum + m.assignment.estimatedValue, 0)
        : computeAssignmentValue(
            dr.row.unassignedOreLines,
            pricesAtHubOnDate(datedPrices, undefined, dr.row.entry.date),
            0
          ).estimatedValue,
    [datedPrices]
  );

  const systemName = useCallback(
    (dr: DisplayRow): string =>
      dr.row.entry.solarSystemId === 0 ? '—' : systemLabel(systemNames, dr.row.entry.solarSystemId),
    [systemNames]
  );

  const systemSecurityOf = useCallback(
    (dr: DisplayRow): number | undefined => systemSecurity?.get(dr.row.entry.solarSystemId),
    [systemSecurity]
  );

  return { pricesFor, priceSourcesFor, estimatedValueOf, systemName, systemSecurityOf };
}
