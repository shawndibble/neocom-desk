/**
 * The extraction rate every projection about an unbuilt planet is made at
 * (issue #425).
 *
 * ## Why this is an estimate, and can never be anything else
 *
 * ESI carries no per-planet resource richness, and the in-game scan overlay
 * shows a colour map rather than a number. So a pilot can say *which*
 * resources they would pull on a planet and nothing at all about *how much* of
 * them comes out. Something has to supply the rate, and everything here is
 * built around that number being an assumption rather than a measurement.
 *
 * ## Where the rate comes from, and why not a second input box
 *
 * The Plan tab asks the pilot to type a rate, because it has to answer for
 * someone with no colonies at all — `chainBlockPins` returns
 * `needs-extraction-rate` rather than guessing, and the field is how that gets
 * answered. Adding a second input here would give one quantity two values that
 * can disagree on screen.
 *
 * So this derives instead: the mean of what the pilot's *own* extractors are
 * actually sustaining, off `advisorModel`'s measured `extractedPerHour`. That
 * is better than any figure they could type, it needs no new control, and
 * `AssumedRate` carries its provenance so the card can say where it came from
 * — the same job `customsRateSource` does for the customs rate.
 *
 * When there is nothing measured, this refuses. It does not fall back to a
 * default rate, because a planet priced off an invented number is exactly the
 * confident-wrong-figure the Advisor exists to avoid — and `advisorModel`
 * already sets the precedent by dropping an extractor with no install-time
 * baseline rather than counting it as zero.
 */

/** Where the assumed extraction rate came from, so a card can say so. */
export type AssumedRate =
  | {
      kind: 'measured-own-colonies';
      /** Mean sustained units an hour across the pilot's own extractors. */
      unitsPerHour: number;
      /** How many extractors that mean is drawn from. One is a thin basis and the card says so. */
      sampleSize: number;
    }
  /** The pilot has no projectable extraction anywhere, so nothing can be estimated. */
  | { kind: 'no-measured-extraction' };

/**
 * The mean of the pilot's own measured extraction, or a refusal.
 *
 * A non-finite or non-positive rate is dropped rather than averaged in: it
 * would drag the mean toward a number no extractor is actually producing.
 */
export function assumedExtractionRate(
  measured: readonly { typeId: number; unitsPerHour: number }[]
): AssumedRate {
  const usable = measured.filter(
    (entry) => Number.isFinite(entry.unitsPerHour) && entry.unitsPerHour > 0
  );
  if (usable.length === 0) return { kind: 'no-measured-extraction' };
  const total = usable.reduce((sum, entry) => sum + entry.unitsPerHour, 0);
  return {
    kind: 'measured-own-colonies',
    unitsPerHour: total / usable.length,
    sampleSize: usable.length,
  };
}
