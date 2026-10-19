/**
 * Skill Extractor readiness (support.eveonline.com "Skill Extractors and
 * Skill Injectors"): a character can never be extracted below 5,000,000 SP,
 * and one extractor pulls a fixed 500,000 SP chunk. So "ready" is never a
 * bare `totalSp >= threshold` — every character clears a 500k threshold on
 * total SP within days of creation, which would flag all of them forever.
 * The floor has to come out first; only what's left above it is extractable.
 *
 * Pure: no fetch/DOM/Dexie — `src/engine` stays a pure calc layer.
 */

/** A character's SP can never be extracted below this. */
export const SP_EXTRACTION_FLOOR_SP = 5_000_000;

/** What one Skill Extractor pulls per use — the natural default threshold. */
export const SP_EXTRACTION_CHUNK_SP = 500_000;

/** SP available to pull without dropping the character below the floor. */
export function extractableSp(totalSp: number): number {
  return Math.max(0, totalSp - SP_EXTRACTION_FLOOR_SP);
}

/** Whether extractable SP has reached the pilot's chosen threshold. */
export function isSpExtractionReady(totalSp: number, thresholdSp: number): boolean {
  return extractableSp(totalSp) >= thresholdSp;
}

/** How many whole Skill Extractors the character could fill right now. */
export function extractorCount(totalSp: number): number {
  return Math.floor(extractableSp(totalSp) / SP_EXTRACTION_CHUNK_SP);
}

/** Large Skill Injector (public/data/market/types.json). */
export const LARGE_SKILL_INJECTOR_TYPE_ID = 40520;

/** Skill Extractor (public/data/market/types.json). */
export const SKILL_EXTRACTOR_TYPE_ID = 40519;

/**
 * ISK earned by one extraction: sell the injector, minus buying the
 * extractor. Before sales tax and broker fees. Null — never 0 — when either
 * side has no sell orders, so "unpriceable" can't read as "break-even".
 */
export function extractionNet(
  injectorSell: number | null,
  extractorSell: number | null
): number | null {
  if (injectorSell === null || extractorSell === null) return null;
  return injectorSell - extractorSell;
}

/** Net ISK across every extractor the character's SP fills right now. */
export function extractionTotalIsk(totalSp: number, net: number | null): number | null {
  return net === null ? null : net * extractorCount(totalSp);
}
