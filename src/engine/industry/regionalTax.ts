/**
 * Region-wide job taxes. Exordium charges an "Exordium Industrial Tax" of 5.00%
 * of the job's EIV on top of the SCC surcharge, shown as its own line in the
 * job cost window (read in game at Manifest V, 2026-11-02: 19,342 ISK on a
 * 386,830 ISK EIV). CCP's announcement gives no number, and the app has only
 * seen it in Manifest's system, so it is assumed to cover the whole region.
 */

/** The Exordium region (Manifest's). */
export const EXORDIUM_REGION_ID = 10001004;

const EXORDIUM_INDUSTRIAL_TAX_PCT = 5;

/** Percent of EIV a region adds to a job's installation cost; 0 where none is known. */
export function regionalJobTaxPct(regionId: number | undefined): number {
  return regionId === EXORDIUM_REGION_ID ? EXORDIUM_INDUSTRIAL_TAX_PCT : 0;
}
