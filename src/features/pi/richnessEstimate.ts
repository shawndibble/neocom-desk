/**
 * Turning a pilot's resource ranking into an estimated hourly value for a
 * planet they have not built on (issue #425).
 *
 * ## Why this is an estimate, and can never be anything else
 *
 * ESI carries no per-planet resource richness, and the in-game scan overlay
 * shows a colour map rather than a number. So the ranking a pilot records says
 * *which* resource is best on a planet and says nothing about *how much* of it
 * comes out. Something has to supply the rate, and everything here is built
 * around that number being an assumption rather than a measurement.
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

export interface RankedResource {
  typeId: number;
  /** 1-based position in the pilot's ranking, or null when they have not ranked it. */
  rank: number | null;
}

/**
 * This planet's resources with the pilot's ranking applied: ranked ones first
 * in their chosen order, then the rest in payload order.
 *
 * An unranked resource keeps `rank: null` rather than being sorted to the end
 * with an implied worst place. "I have not scanned this" and "this is the
 * worst here" are different claims, and only the first is one the app knows.
 *
 * A ranked typeID the planet type does not actually yield is dropped: rankings
 * are durable and planet types change between patches, so the planet's own
 * resource list stays the authority over a stale ordering.
 */
export function rankedResources(
  localResources: readonly number[],
  order: readonly number[]
): RankedResource[] {
  const local = new Set(localResources);
  const ranking = order.filter((typeId) => local.has(typeId));
  const rankByType = new Map(ranking.map((typeId, index) => [typeId, index + 1]));

  return [
    ...ranking.map((typeId) => ({ typeId, rank: rankByType.get(typeId) as number })),
    ...localResources
      .filter((typeId) => !rankByType.has(typeId))
      .map((typeId) => ({
        typeId,
        rank: null,
      })),
  ];
}

export type UnbuiltEstimate =
  | {
      kind: 'estimate';
      /** The pilot's own best-ranked resource on this planet. */
      typeId: number;
      unitsPerHour: number;
      iskPerHour: number;
      /** Carried so the card can state what the figure rests on. */
      rate: Extract<AssumedRate, { kind: 'measured-own-colonies' }>;
    }
  /** No ranking saved for this planet — the card keeps naming resources and pricing none. */
  | { kind: 'needs-ranking' }
  /** A ranking exists, but the pilot has no measured extraction to project from. */
  | { kind: 'needs-measured-extraction' }
  /** The best resource has no hub price, so it is left unpriced rather than valued at zero. */
  | { kind: 'needs-price'; typeId: number };

export interface UnbuiltEstimateInput {
  /** Every P0 this planet type yields. */
  localResources: readonly number[];
  /** The pilot's saved ranking, richest first. Empty when they have not ranked this planet. */
  order: readonly number[];
  rate: AssumedRate;
  /** Hub price per unit by typeID. A missing entry is unpriced, not free. */
  prices: Readonly<Record<number, number>>;
}

/**
 * What one extractor on this planet would be worth an hour, if it pulled the
 * pilot's best-ranked resource at their own colonies' average rate.
 *
 * Every branch that cannot answer says which input is missing, rather than
 * returning a number with a caveat attached. A caveat is easy to miss; an
 * absent figure is not.
 */
export function estimateUnbuiltPlanet(input: UnbuiltEstimateInput): UnbuiltEstimate {
  const best = rankedResources(input.localResources, input.order).find((entry) => entry.rank === 1);
  if (!best) return { kind: 'needs-ranking' };
  if (input.rate.kind !== 'measured-own-colonies') return { kind: 'needs-measured-extraction' };

  const price = input.prices[best.typeId];
  if (!Number.isFinite(price) || price === undefined)
    return { kind: 'needs-price', typeId: best.typeId };

  return {
    kind: 'estimate',
    typeId: best.typeId,
    unitsPerHour: input.rate.unitsPerHour,
    iskPerHour: input.rate.unitsPerHour * price,
    rate: input.rate,
  };
}
