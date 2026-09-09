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
