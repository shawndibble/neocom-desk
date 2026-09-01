/**
 * Groups an item's ESI dogma attribute values by SDE category, resolving
 * each to its display name and unit via the attribute dictionary
 * (scripts/build-sde.mjs, CONTEXT.md round 6 "Item Detail"). Pure — callers
 * adapt ESI/SDE shapes at the boundary. An attribute id with no dictionary
 * entry (unpublished, or published but nameless) is skipped rather than
 * shown as a raw identifier — a curated allow-list was rejected for the same
 * reason: it would silently drop whatever mattered for an item class nobody
 * thought about.
 */

export interface RawDogmaAttribute {
  attribute_id: number;
  value: number;
}

export interface AttributeDictionaryEntry {
  name: string;
  unit: string | null;
  category: string;
}

export type AttributeDictionary = Readonly<Record<number, AttributeDictionaryEntry>>;

export interface DisplayAttribute {
  attributeId: number;
  name: string;
  unit: string | null;
  value: number;
}

export interface AttributeGroup {
  category: string;
  attributes: DisplayAttribute[];
}

/** Groups by category, sorted alphabetically; attributes within a group sorted by display name. */
export function groupItemAttributes(
  dogmaAttributes: readonly RawDogmaAttribute[] | undefined,
  dictionary: AttributeDictionary
): AttributeGroup[] {
  if (!dogmaAttributes || dogmaAttributes.length === 0) return [];

  const byCategory = new Map<string, DisplayAttribute[]>();
  for (const { attribute_id, value } of dogmaAttributes) {
    const entry = dictionary[attribute_id];
    if (!entry) continue;
    let list = byCategory.get(entry.category);
    if (!list) {
      list = [];
      byCategory.set(entry.category, list);
    }
    list.push({ attributeId: attribute_id, name: entry.name, unit: entry.unit, value });
  }

  const groups = [...byCategory.entries()].map(([category, attributes]) => ({
    category,
    attributes: attributes.sort((a, b) => a.name.localeCompare(b.name)),
  }));
  groups.sort((a, b) => a.category.localeCompare(b.category));
  return groups;
}
