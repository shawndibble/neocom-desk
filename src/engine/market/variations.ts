/**
 * Resolves "all variations of type X" — the Tech I root plus every Tech II /
 * Faction / Storyline / Officer sibling across all its meta groups, matching
 * the EVE client's own Variations tab (scripts/build-sde.mjs,
 * public/data/market/variations.json). Pure — callers adapt the SDE snapshot
 * shape at the boundary. A metaGroupId with no display name is skipped
 * rather than shown as a raw identifier, same precedent as itemAttributes.ts.
 */

export interface VariationEntry {
  parentTypeId: number | null;
  metaGroupId: number;
}

export type VariationTypeMap = Readonly<Record<number, VariationEntry>>;
export type MetaGroupNameMap = Readonly<Record<number, string>>;

export interface VariationMember {
  typeId: number;
  metaGroupId: number;
  metaGroupName: string;
}

export interface VariationGroup {
  rootTypeId: number;
  members: VariationMember[];
}

export interface VariationIndex {
  readonly types: VariationTypeMap;
  readonly metaGroupNames: MetaGroupNameMap;
  readonly childrenByRoot: ReadonlyMap<number, readonly number[]>;
}

/** Builds the root -> children lookup once so getVariations is O(group size) per call. */
export function buildVariationIndex(
  types: VariationTypeMap,
  metaGroupNames: MetaGroupNameMap
): VariationIndex {
  const childrenByRoot = new Map<number, number[]>();
  for (const [typeIdStr, entry] of Object.entries(types)) {
    if (entry.parentTypeId == null) continue;
    const typeId = Number(typeIdStr);
    let list = childrenByRoot.get(entry.parentTypeId);
    if (!list) {
      list = [];
      childrenByRoot.set(entry.parentTypeId, list);
    }
    list.push(typeId);
  }
  return { types, metaGroupNames, childrenByRoot };
}

function toMember(
  typeId: number,
  entry: VariationEntry,
  metaGroupNames: MetaGroupNameMap
): VariationMember | null {
  const metaGroupName = metaGroupNames[entry.metaGroupId];
  if (metaGroupName == null) return null;
  return { typeId, metaGroupId: entry.metaGroupId, metaGroupName };
}

/** Resolves typeId's full variation group. Unknown typeIds get an empty member list, not a guess. */
export function getVariations(index: VariationIndex, typeId: number): VariationGroup {
  const entry = index.types[typeId];
  if (!entry) return { rootTypeId: typeId, members: [] };

  const rootTypeId = entry.parentTypeId ?? typeId;
  const candidateIds = [rootTypeId, ...(index.childrenByRoot.get(rootTypeId) ?? [])];

  const members: VariationMember[] = [];
  for (const candidateId of candidateIds) {
    const candidateEntry = index.types[candidateId];
    if (!candidateEntry) continue;
    const member = toMember(candidateId, candidateEntry, index.metaGroupNames);
    if (member) members.push(member);
  }
  members.sort((a, b) => a.metaGroupId - b.metaGroupId || a.typeId - b.typeId);

  return { rootTypeId, members };
}
