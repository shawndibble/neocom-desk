export type BlueprintSource = 'owned' | 'market' | 'contract' | 'lpStore' | 'invention';

export interface BlueprintSourceSets {
  owned: ReadonlySet<number>;
  market: ReadonlySet<number>;
  contract: ReadonlySet<number>;
  lpStore: ReadonlySet<number>;
  invention: ReadonlySet<number>;
}

const PREFERENCE: readonly BlueprintSource[] = [
  'owned',
  'market',
  'contract',
  'lpStore',
  'invention',
];

export const BLUEPRINT_SOURCES = PREFERENCE;

export const BLUEPRINT_SOURCE_RANK = Object.fromEntries(
  PREFERENCE.map((source, index) => [source, index])
) as Record<BlueprintSource, number>;

export function blueprintSource(
  blueprintTypeID: number,
  sets: BlueprintSourceSets
): BlueprintSource | null {
  return PREFERENCE.find((source) => sets[source].has(blueprintTypeID)) ?? null;
}

const NPC_SEEDED_META_GROUPS: ReadonlySet<number> = new Set([1, 54]);

export function isNpcSeededProduct(productMetaGroupId: number | undefined): boolean {
  return productMetaGroupId === undefined || NPC_SEEDED_META_GROUPS.has(productMetaGroupId);
}
