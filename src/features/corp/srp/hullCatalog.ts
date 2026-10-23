/**
 * The hulls and hull classes a Hull Rule can name, from the SDE the app already
 * ships: every type in the Ship category (`types.json` + `groupCategories.json`, as
 * `fittings/hullNames.ts` does), and its ship group as the class (HullRuleScope 'class' keys on
 * a ship group id, ADR 0026). Group names are not in the SDE snapshot: `useHullCatalog` reads them
 * through `loadGroupNames`. Pure here: no fetch.
 */
import { SHIP_CATEGORY_ID } from '@/sde/categories';
import type { TypeMap } from '@/sde/types';

export interface Hull {
  id: number;
  name: string;
  classId: number;
}

export interface HullCatalog {
  classIds: number[];
  hullsByClass: ReadonlyMap<number, Hull[]>;
  hulls: Hull[];
  hull: (id: number) => Hull | undefined;
}

export function buildHullCatalog(
  types: TypeMap,
  categories: Readonly<Record<string, number>>
): HullCatalog {
  const byId = new Map<number, Hull>();
  const hullsByClass = new Map<number, Hull[]>();
  for (const [id, type] of Object.entries(types)) {
    if (categories[String(type.groupID)] !== SHIP_CATEGORY_ID) continue;
    const hull = { id: Number(id), name: type.name, classId: type.groupID };
    byId.set(hull.id, hull);
    const list = hullsByClass.get(hull.classId) ?? [];
    list.push(hull);
    hullsByClass.set(hull.classId, list);
  }
  for (const list of hullsByClass.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return {
    classIds: [...hullsByClass.keys()],
    hullsByClass,
    hulls: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
    hull: (id) => byId.get(id),
  };
}

/** Every hull whose name contains the query; blank gives none. Not capped: the list scrolls. */
export function searchHulls(catalog: HullCatalog, query: string): Hull[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return catalog.hulls.filter((h) => h.name.toLowerCase().includes(q));
}
