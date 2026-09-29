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

/** Every source, in `blueprintSource`'s preference order. */
export const BLUEPRINT_SOURCES = PREFERENCE;

/** Each source's position in `blueprintSource`'s preference order — a sort key for a source column. */
export const BLUEPRINT_SOURCE_RANK = Object.fromEntries(
  PREFERENCE.map((source, index) => [source, index])
) as Record<BlueprintSource, number>;

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

/** Tech I and Structure Tech I (`variations.json` metaGroups) — the only tiers NPCs sell blueprints for. */
const NPC_SEEDED_META_GROUPS: ReadonlySet<number> = new Set([1, 54]);

/**
 * Whether NPCs sell the blueprint for a product of this meta group.
 * Market-grouping alone isn't enough: CCP market-groups the old T2 lottery
 * BPOs (Vagabond, Crow, Sabre…) and some faction LP blueprints too, and no
 * NPC seeds any of those. A product with no meta group is a T1 root —
 * components, capitals, fuel blocks, structures.
 */
export function isNpcSeededProduct(productMetaGroupId: number | undefined): boolean {
  return productMetaGroupId === undefined || NPC_SEEDED_META_GROUPS.has(productMetaGroupId);
}
