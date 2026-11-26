import {
  compareAttributeNames,
  groupItemAttributes,
  type AttributeDictionary,
  type AttributeReferenceNames,
  type RawDogmaAttribute,
} from './itemAttributes';

export interface CompareMatrixItem {
  typeId: number;
  dogmaAttributes: readonly RawDogmaAttribute[] | undefined;
  bestSell: number | null | undefined;
}

export interface CompareCell {
  value: number;
  unit: string | null;
  displayValue?: string;
}

export interface CompareAttributeRow {
  key: string;
  name: string;
  kind: 'price' | 'attribute';
  cells: ReadonlyMap<number, CompareCell>;
}

export interface CompareAttributeGroup {
  category: string;
  rows: CompareAttributeRow[];
}

export interface CompareMatrixLabels {
  worth: string;
  estimatedPrice: string;
}

export function buildCompareMatrix(
  items: readonly CompareMatrixItem[],
  dictionary: AttributeDictionary,
  labels: CompareMatrixLabels,
  names: AttributeReferenceNames = {}
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
    const groups = groupItemAttributes(item.dogmaAttributes, dictionary, names);
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
        .sort((a, b) => compareAttributeNames(a.name, b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return [worthGroup, ...attributeGroups];
}

function cellText(cell: CompareCell): string {
  return cell.displayValue ?? `${cell.value}|${cell.unit ?? ''}`;
}

export function isUniformRow(row: CompareAttributeRow, typeIds: readonly number[]): boolean {
  if (row.kind === 'price' || typeIds.length < 2) return false;
  let first: string | undefined;
  for (const typeId of typeIds) {
    const cell = row.cells.get(typeId);
    if (!cell) return false;
    const text = cellText(cell);
    if (first === undefined) first = text;
    else if (text !== first) return false;
  }
  return true;
}
