export const EXORDIUM_REGION_ID = 10001004;

const EXORDIUM_INDUSTRIAL_TAX_PCT = 5;

export function regionalJobTaxPct(regionId: number | undefined): number {
  return regionId === EXORDIUM_REGION_ID ? EXORDIUM_INDUSTRIAL_TAX_PCT : 0;
}
