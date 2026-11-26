import type { ShipTreeNodeDef } from './types';

export const CALDARI_FACTION_ID = 500001;
export const MINMATAR_FACTION_ID = 500002;
export const AMARR_FACTION_ID = 500003;
export const GALLENTE_FACTION_ID = 500004;
export const EMPIRE_FACTION_IDS: ReadonlySet<number> = new Set([
  CALDARI_FACTION_ID,
  MINMATAR_FACTION_ID,
  AMARR_FACTION_ID,
  GALLENTE_FACTION_ID,
]);
export const ORE_FACTION_ID = 500014;

export const PIRATE_FACTION_IDS: ReadonlySet<number> = new Set([
  500010, 500011, 500012, 500016, 500018, 500019, 500020,
]);

export const CORVETTE_CLASS_ID = 4;
export const DREADNOUGHT_CLASS_ID = 32;

export const STACKED_CLASSES: ReadonlySet<number> = new Set([
  9, 17, 25, 47, 2101, 2102, 2110, 2111,
]);

const BRANCHES: readonly ShipTreeNodeDef[] = [
  { id: 9, parent: 8, lane: 'branch' },
  { id: 10, parent: 8, lane: 'branch' },
  { id: 11, parent: 8, lane: 'branch' },
  { id: 12, parent: 8, lane: 'branch' },
  { id: 13, parent: 8, lane: 'branch' },
  { id: 94, parent: 8, lane: 'branch' },

  { id: 2101, parent: 14, lane: 'branch' },
  { id: 93, parent: 14, lane: 'branch' },
  { id: 15, parent: 14, lane: 'branch' },
  { id: 50, parent: 14, lane: 'branch' },

  { id: 17, parent: 16, lane: 'branch' },
  { id: 18, parent: 16, lane: 'branch' },
  { id: 19, parent: 16, lane: 'branch' },
  { id: 20, parent: 16, lane: 'branch' },
  { id: 21, parent: 16, lane: 'branch' },
  { id: 22, parent: 16, lane: 'branch' },

  { id: 25, parent: 23, lane: 'branch' },
  { id: 24, parent: 23, lane: 'branch' },
  { id: 2109, parent: 23, lane: 'branch' },

  { id: 47, parent: 26, lane: 'branch' },
  { id: 28, parent: 26, lane: 'branch' },
  { id: 27, parent: 26, lane: 'branch' },

  { id: 2102, parent: 32, lane: 'branch' },
  { id: 2104, parent: 32, lane: 'branch' },
  { id: 33, parent: 32, lane: 'capital' },
  { id: 2113, parent: 32, lane: 'capital' },
  { id: 34, parent: 32, lane: 'capital' },
];

const EMPIRE: readonly ShipTreeNodeDef[] = [
  { id: 4, parent: null, lane: 'main' },
  { id: 8, parent: 4, lane: 'main' },
  { id: 14, parent: 8, lane: 'main' },
  { id: 16, parent: 14, lane: 'main' },
  { id: 23, parent: 16, lane: 'main' },
  { id: 26, parent: 23, lane: 'main' },
  { id: 32, parent: 26, lane: 'main' },
  { id: 96, parent: 16, lane: 'branch' },
  ...BRANCHES,
  { id: 35, parent: 4, lane: 'industry' },
  { id: 36, parent: 35, lane: 'industry' },
  { id: 37, parent: 36, lane: 'industry' },
  { id: 40, parent: 36, lane: 'branch' },
  { id: 38, parent: 37, lane: 'branch' },
];

const NON_EMPIRE: readonly ShipTreeNodeDef[] = [
  { id: 35, parent: null, lane: 'main' },
  { id: 8, parent: null, lane: 'main' },
  { id: 12, parent: 8, lane: 'main' },
  { id: 14, parent: 8, lane: 'main' },
  { id: 16, parent: 14, lane: 'main' },
  { id: 18, parent: 16, lane: 'main' },
  { id: 23, parent: 16, lane: 'main' },
  { id: 26, parent: 23, lane: 'main' },
  { id: 27, parent: 26, lane: 'main' },
  { id: 32, parent: 26, lane: 'main' },
  { id: 96, parent: 18, lane: 'branch' },
  ...BRANCHES.filter((b) => b.id !== 12 && b.id !== 18 && b.id !== 27),
  { id: 36, parent: null, lane: 'industry' },
  { id: 37, parent: 36, lane: 'industry' },
  { id: 40, parent: 36, lane: 'branch' },
  { id: 38, parent: 37, lane: 'branch' },
];

const ORE: readonly ShipTreeNodeDef[] = [
  { id: 41, parent: null, lane: 'main' },
  { id: 2108, parent: 41, lane: 'main' },
  { id: 42, parent: 2108, lane: 'main' },

  { id: 2111, parent: 41, lane: 'branch' },
  { id: 48, parent: 41, lane: 'branch' },
  { id: 2110, parent: 2108, lane: 'branch' },
  { id: 2112, parent: 2108, lane: 'branch' },
  { id: 43, parent: 42, lane: 'branch' },

  { id: 44, parent: null, lane: 'industry' },
  { id: 45, parent: 44, lane: 'industry' },
  { id: 46, parent: 45, lane: 'industry' },
  { id: 37, parent: 44, lane: 'drop' },
];

export function treeFor(
  factionID: number,
  presentClassIds: ReadonlySet<number>
): ShipTreeNodeDef[] {
  const template =
    factionID === ORE_FACTION_ID ? ORE : EMPIRE_FACTION_IDS.has(factionID) ? EMPIRE : NON_EMPIRE;
  const byId = new Map(template.map((n) => [n.id, n]));
  const nearest = (id: number | null): number | null => {
    let cur = id;
    while (cur !== null && !presentClassIds.has(cur)) cur = byId.get(cur)?.parent ?? null;
    return cur;
  };
  const nodes = template
    .filter((n) => presentClassIds.has(n.id))
    .map((n) => ({ ...n, parent: nearest(n.parent) }));
  const known = new Set(nodes.map((n) => n.id));
  for (const id of presentClassIds) {
    if (!known.has(id)) nodes.push({ id, parent: null, lane: 'branch' });
  }
  return nodes;
}
