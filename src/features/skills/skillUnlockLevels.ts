import { IMPLANT_CATEGORY_ID, SHIP_CATEGORY_ID } from '@/sde/categories';
import type { SkillItemUnlockIndex } from '@/sde/loadSde';
import type { UnlockRow } from './skillRequirements';

export const ITEM_UNLOCK_KINDS = ['ship', 'module', 'charge', 'drone', 'implant', 'other'] as const;
export type ItemUnlockKind = (typeof ITEM_UNLOCK_KINDS)[number];
export type UnlockKind = 'skill' | ItemUnlockKind;

export interface ItemUnlockRow extends UnlockRow {
  kind: ItemUnlockKind;
}

const KIND_BY_CATEGORY: Readonly<Record<number, ItemUnlockKind>> = {
  [SHIP_CATEGORY_ID]: 'ship',
  7: 'module',
  32: 'module',
  66: 'module',
  8: 'charge',
  18: 'drone',
  87: 'drone',
  [IMPLANT_CATEGORY_ID]: 'implant',
};

export function unlockKindOf(categoryId: number | undefined): ItemUnlockKind {
  return (categoryId !== undefined && KIND_BY_CATEGORY[categoryId]) || 'other';
}

export function buildItemUnlocks(
  skillTypeID: number,
  index: SkillItemUnlockIndex,
  types: Readonly<Record<string, { name: string; groupID: number }>>,
  groupCategories: Readonly<Record<string, number>>
): ItemUnlockRow[] {
  const rows: ItemUnlockRow[] = [];
  for (const [typeID, level] of index[String(skillTypeID)] ?? []) {
    const type = types[String(typeID)];
    if (!type) continue;
    rows.push({
      typeID,
      name: type.name,
      level,
      kind: unlockKindOf(groupCategories[String(type.groupID)]),
    });
  }
  return rows;
}

export interface UnlockGroup {
  kind: UnlockKind;
  rows: readonly UnlockRow[];
}

export interface UnlockLevel {
  level: number;
  count: number;
  groups: UnlockGroup[];
}

const KIND_ORDER: readonly UnlockKind[] = ['skill', ...ITEM_UNLOCK_KINDS];

export function groupUnlocksByLevel(
  skills: readonly UnlockRow[],
  items: readonly ItemUnlockRow[]
): UnlockLevel[] {
  const byLevel = new Map<number, Map<UnlockKind, UnlockRow[]>>();
  const add = (kind: UnlockKind, row: UnlockRow) => {
    let kinds = byLevel.get(row.level);
    if (!kinds) byLevel.set(row.level, (kinds = new Map()));
    let rows = kinds.get(kind);
    if (!rows) kinds.set(kind, (rows = []));
    rows.push(row);
  };
  for (const row of skills) add('skill', row);
  for (const row of items) add(row.kind, row);

  return [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((level) => {
      const kinds = byLevel.get(level)!;
      const groups = KIND_ORDER.flatMap((kind) => {
        const rows = kinds.get(kind);
        return rows ? [{ kind, rows: [...rows].sort((a, b) => a.name.localeCompare(b.name)) }] : [];
      });
      return { level, count: groups.reduce((n, g) => n + g.rows.length, 0), groups };
    });
}
