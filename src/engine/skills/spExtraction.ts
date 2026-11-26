export const SP_EXTRACTION_FLOOR_SP = 5_000_000;

export const SP_EXTRACTION_CHUNK_SP = 500_000;

export function extractableSp(totalSp: number): number {
  return Math.max(0, totalSp - SP_EXTRACTION_FLOOR_SP);
}

export function isSpExtractionReady(totalSp: number, thresholdSp: number): boolean {
  return extractableSp(totalSp) >= thresholdSp;
}

export function extractorCount(totalSp: number): number {
  return Math.floor(extractableSp(totalSp) / SP_EXTRACTION_CHUNK_SP);
}

export const LARGE_SKILL_INJECTOR_TYPE_ID = 40520;

export const SKILL_EXTRACTOR_TYPE_ID = 40519;

export function extractionNet(
  injectorSell: number | null,
  extractorSell: number | null
): number | null {
  if (injectorSell === null || extractorSell === null) return null;
  return injectorSell - extractorSell;
}

export function extractionTotalIsk(totalSp: number, net: number | null): number | null {
  return net === null ? null : net * extractorCount(totalSp);
}
