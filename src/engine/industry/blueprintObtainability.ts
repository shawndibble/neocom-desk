/**
 * Whether a pilot can actually get hold of a blueprint, and by which route —
 * the gate the market-wide scan puts in front of every candidate so it never
 * ranks a product nobody on the account can build. Pure: the caller loads
 * each source's blueprint typeIDs and this only picks between them.
 */

/** Where a blueprint can come from, in the order `blueprintSource` prefers them. */
export type BlueprintSource = 'owned' | 'market' | 'contract' | 'lpStore';

/** Blueprint typeIDs each source carries. */
export interface BlueprintSourceSets {
  /** Held by any Character on the account, original or copy. */
  owned: ReadonlySet<number>;
  /** On the NPC market (a market-grouped blueprint original). */
  market: ReadonlySet<number>;
  /** Listed on a public contract, copy or original, in any region. */
  contract: ReadonlySet<number>;
  /** Offered by an LP store the account holds points with. */
  lpStore: ReadonlySet<number>;
}

const PREFERENCE: readonly BlueprintSource[] = ['owned', 'market', 'contract', 'lpStore'];

/**
 * The first source carrying `blueprintTypeID`, or null when none does. Owned
 * wins (it costs nothing more), then the NPC market (a fixed, always-stocked
 * price), then contracts, then LP stores.
 */
export function blueprintSource(
  blueprintTypeID: number,
  sets: BlueprintSourceSets
): BlueprintSource | null {
  return PREFERENCE.find((source) => sets[source].has(blueprintTypeID)) ?? null;
}
