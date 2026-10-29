import { useCallback } from 'react';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { allMembers, type DisplayRow } from '@/features/miningTax/groupRows';
import { systemLabel } from '@/features/miningTax/names';
import {
  pricesAtHubOnDate,
  sourcesAtHubOnDate,
  type DatedUnitPrices,
} from '@/features/miningTax/pricing';

/** The price lookups and per-row readings the Tax tab's tables and dialogs share. */
export function useTaxPricing(
  datedPrices: DatedUnitPrices,
  systemNames: ReadonlyMap<number, string>,
  systemSecurity: ReadonlyMap<number, number>
) {
  /**
   * The seam every value-computing dialog reads: prices at whichever hub a
   * Payee bills at, on the date the ore was actually mined (issue #523
   * follow-up decision doc) — not "now". A lookup rather than one map,
   * because the dialogs are where the Payee (and so the hub) is chosen —
   * assigning to a different Payee, or splitting ore over to a second one,
   * re-values the same ore against a different order book, and this is what
   * lets that happen without another fetch.
   */
  const pricesFor = useCallback(
    (hubId: string | undefined, date: string): ReadonlyMap<number, number> =>
      pricesAtHubOnDate(datedPrices, hubId, date),
    [datedPrices]
  );

  /** Which price tier produced each of `pricesFor`'s numbers — the row detail's breakdown. */
  const priceSourcesFor = useCallback(
    (hubId: string | undefined, date: string) => sourcesAtHubOnDate(datedPrices, hubId, date),
    [datedPrices]
  );

  /** Both the table's Value column and the sole Assignment-less rows: an unassigned entry has no `estimatedValue` of its own, so it's priced live from its still-unclaimed ore lines instead. A combined row sums every member's own value — never a blended re-price across dates. */
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
