/**
 * Builds the Variations "Compare" matrix (issue #146): items as columns,
 * dogma attributes as rows grouped by category — the union across every
 * item in the group, via the same `groupItemAttributes` grouping
 * `ItemDetailModal` uses per item. An item missing a given attribute simply
 * has no entry in that row's cell map (rendered as a blank cell, same "—"
 * convention `CompareDrawer` uses for missing prices) rather than the row
 * being hidden. Estimated Price is a synthetic first row under a synthetic
 * "Worth" category — it isn't a dogma attribute, so it can't come from
 * `groupItemAttributes`; it's prepended here from each item's own
 * already-fetched order-book summary instead of being re-fetched. No
 * relative best/worst coloring — deferred, see issue #146.
 */
import {
  groupItemAttributes,
  type AttributeDictionary,
  type RawDogmaAttribute,
} from './itemAttributes';

export interface CompareMatrixItem {
  typeId: number;
  dogmaAttributes: readonly RawDogmaAttribute[] | undefined;
  /** Null/undefined = no known best sell for this item; renders as a blank cell. */
  bestSell: number | null | undefined;
}

export interface CompareCell {
  value: number;
  unit: string | null;
  /** Set only for required-skill rows: "<Skill name> <roman level>", overriding value/unit in display. */
  displayValue?: string;
}

export interface CompareAttributeRow {
  key: string;
  name: string;
  /** 'price' formats via formatIsk; 'attribute' via formatAttributeValue + unit. */
  kind: 'price' | 'attribute';
  /** typeId -> cell; a missing entry is a blank cell, not a zero/empty value. */
  cells: ReadonlyMap<number, CompareCell>;
}

export interface CompareAttributeGroup {
  category: string;
  rows: CompareAttributeRow[];
}

/**
 * Labels for the synthetic price row. Every other name in the matrix is SDE
 * data, but these two are UI strings, so they arrive already translated from
 * the caller rather than being hardcoded here.
 */
export interface CompareMatrixLabels {
  /** Category heading the price row sits under. */
  worth: string;
  /** The price row's own name. */
  estimatedPrice: string;
}

/** Grouped by category (Worth always first), sorted alphabetically thereafter; rows within a group sorted by name. */
export function buildCompareMatrix(
  items: readonly CompareMatrixItem[],
  dictionary: AttributeDictionary,
  labels: CompareMatrixLabels,
  skillNames: Readonly<Record<number, string>> = {}
): CompareAttributeGroup[] {
  const priceCells = new Map<number, CompareCell>();
  for (const item of items) {
    if (item.bestSell != null) priceCells.set(item.typeId, { value: item.bestSell, unit: null });
  }
  const worthGroup: CompareAttributeGroup = {
    category: labels.worth,
    rows: [{ key: 'price', name: labels.estimatedPrice, kind: 'price', cells: priceCells }],
  };

  const categories = new Map<
    string,
    Map<number, { name: string; cells: Map<number, CompareCell> }>
  >();

  for (const item of items) {
    const groups = groupItemAttributes(item.dogmaAttributes, dictionary, skillNames);
    for (const group of groups) {
      let attrs = categories.get(group.category);
      if (!attrs) {
        attrs = new Map();
        categories.set(group.category, attrs);
      }
      for (const attribute of group.attributes) {
        let entry = attrs.get(attribute.attributeId);
        if (!entry) {
          entry = { name: attribute.name, cells: new Map() };
          attrs.set(attribute.attributeId, entry);
        }
        entry.cells.set(item.typeId, {
          value: attribute.value,
          unit: attribute.unit,
          displayValue: attribute.displayValue,
        });
      }
    }
  }

  const attributeGroups: CompareAttributeGroup[] = [...categories.entries()]
    .map(([category, attrs]) => ({
      category,
      rows: [...attrs.entries()]
        .map(([attributeId, entry]): CompareAttributeRow => ({
          key: `attr:${attributeId}`,
          name: entry.name,
          kind: 'attribute',
          cells: entry.cells,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return [worthGroup, ...attributeGroups];
}
