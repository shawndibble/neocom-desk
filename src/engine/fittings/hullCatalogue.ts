import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

export interface HullEntry {
  typeId: number;
  name: string;
  group: string;
}

export type StartHull = Pick<HullEntry, 'typeId' | 'name'>;

export interface HullClass {
  id: number;
  name: string;
  hulls: HullEntry[];
}

const CLASS_ORDER = [
  'Corvettes',
  'Shuttles',
  'Frigates',
  'Destroyers',
  'Cruisers',
  'Battlecruisers',
  'Battleships',
  'Capital Ships',
  'Haulers and Industrial Ships',
  'Mining Barges',
  'Special Edition Ships',
];

function classRank(name: string): number {
  const index = CLASS_ORDER.indexOf(name);
  return index === -1 ? CLASS_ORDER.length : index;
}

export function buildHullCatalogue(
  groups: readonly MarketGroupNode[],
  types: readonly MarketTypeEntry[]
): HullClass[] {
  const ships = groups.find((group) => group.name === 'Ships' && group.parentId === null);
  if (!ships) return [];
  const byId = new Map(groups.map((group) => [group.id, group]));

  function placeOf(groupId: number): { classId: number; path: string[] } | null {
    const path: string[] = [];
    let node = byId.get(groupId);
    while (node && node.parentId !== ships!.id) {
      path.unshift(node.name);
      node = node.parentId === null ? undefined : byId.get(node.parentId);
    }
    return node ? { classId: node.id, path } : null;
  }

  const hullsByClass = new Map<number, HullEntry[]>();
  for (const type of types) {
    const place = placeOf(type.marketGroupId);
    if (!place) continue;
    const hulls = hullsByClass.get(place.classId) ?? [];
    hulls.push({ typeId: type.typeId, name: type.name, group: place.path.join(' · ') });
    hullsByClass.set(place.classId, hulls);
  }

  return [...hullsByClass.entries()]
    .map(([id, hulls]) => ({
      id,
      name: byId.get(id)!.name,
      hulls: hulls.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => classRank(a.name) - classRank(b.name) || a.name.localeCompare(b.name));
}

export function searchHulls(catalogue: HullClass[], query: string): HullClass[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return catalogue;
  return catalogue
    .map((hullClass) => ({
      ...hullClass,
      hulls: hullClass.hulls.filter((hull) => {
        const haystack = `${hull.name} ${hull.group}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((hullClass) => hullClass.hulls.length > 0);
}
