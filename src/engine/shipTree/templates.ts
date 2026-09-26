/**
 * The Ship Tree's shape. CCP ships the class list (shipTreeGroups) but no
 * parent links or positions, so which class hangs off which is written here,
 * checked against in-game ISIS screenshots (Caldari, Amarr, Guristas, ORE,
 * CONCORD, EDENCOM; 2026-09-26). See `types.ts` for what each lane means.
 *
 * Open: Interdictor vs Command Destroyer order in the destroyer stack
 * couldn't be read off the screenshots.
 */
import type { ShipTreeNodeDef } from './types';

export const EMPIRE_FACTION_IDS: ReadonlySet<number> = new Set([500001, 500002, 500003, 500004]);
export const ORE_FACTION_ID = 500014;

/** Navy/faction classes sit straight above their parent, not stepped right. */
export const STACKED_CLASSES: ReadonlySet<number> = new Set([
  9, 17, 25, 47, 2101, 2102, 2110, 2111,
]);

/** Specialised classes, bottom to top, shared by the empire and pirate trees. */
const BRANCHES: readonly ShipTreeNodeDef[] = [
  { id: 9, parent: 8, lane: 'branch' }, // Navy Frigate
  { id: 10, parent: 8, lane: 'branch' }, // Interceptor
  { id: 11, parent: 8, lane: 'branch' }, // Assault Frigate
  { id: 12, parent: 8, lane: 'branch' }, // Covert Ops
  { id: 13, parent: 8, lane: 'branch' }, // Electronic Attack Ship
  { id: 94, parent: 8, lane: 'branch' }, // Logistics Frigate

  { id: 2101, parent: 14, lane: 'branch' }, // Navy Destroyer
  { id: 93, parent: 14, lane: 'branch' }, // Command Destroyer
  { id: 15, parent: 14, lane: 'branch' }, // Interdictor
  { id: 50, parent: 14, lane: 'branch' }, // Tactical Destroyer

  { id: 17, parent: 16, lane: 'branch' }, // Navy Cruiser
  { id: 18, parent: 16, lane: 'branch' }, // Recon
  { id: 19, parent: 16, lane: 'branch' }, // HAC
  { id: 20, parent: 16, lane: 'branch' }, // HIC
  { id: 21, parent: 16, lane: 'branch' }, // Logistics Cruiser
  { id: 22, parent: 16, lane: 'branch' }, // Strategic Cruiser

  { id: 25, parent: 23, lane: 'branch' }, // Navy Battlecruiser
  { id: 24, parent: 23, lane: 'branch' }, // Command Ship
  { id: 2109, parent: 23, lane: 'branch' }, // Expedition Command Ship

  { id: 47, parent: 26, lane: 'branch' }, // Navy Battleship
  { id: 28, parent: 26, lane: 'branch' }, // Marauder
  { id: 27, parent: 26, lane: 'branch' }, // Black Ops

  { id: 2102, parent: 32, lane: 'branch' }, // Navy Dreadnought
  { id: 2104, parent: 32, lane: 'branch' }, // Lancer Dreadnought
  { id: 33, parent: 32, lane: 'capital' }, // Carrier
  { id: 2113, parent: 32, lane: 'capital' }, // Command Carrier
  { id: 34, parent: 32, lane: 'capital' }, // Titan
];

const EMPIRE: readonly ShipTreeNodeDef[] = [
  { id: 4, parent: null, lane: 'main' }, // Corvette (drawn on its own row)
  { id: 8, parent: 4, lane: 'main' }, // Frigate
  { id: 14, parent: 8, lane: 'main' }, // Destroyer
  { id: 16, parent: 14, lane: 'main' }, // Cruiser
  { id: 23, parent: 16, lane: 'main' }, // Battlecruiser
  { id: 26, parent: 23, lane: 'main' }, // Battleship
  { id: 32, parent: 26, lane: 'main' }, // Dreadnought
  { id: 96, parent: 16, lane: 'branch' }, // Flag Cruiser
  ...BRANCHES,
  { id: 35, parent: 4, lane: 'industry' }, // Shuttle
  { id: 36, parent: 35, lane: 'industry' }, // Hauler
  { id: 37, parent: 36, lane: 'industry' }, // Freighter
  { id: 40, parent: 36, lane: 'branch' }, // Transport Ship
  { id: 38, parent: 37, lane: 'branch' }, // Jump Freighter
];

// Pirates, CONCORD, EDENCOM, Triglavian…: whatever classes they have sit on
// the main line in hull-size order (CONCORD: Shuttle → Covert Ops → Recon →
// Black Ops, Flag Cruiser above Recon).
const NON_EMPIRE: readonly ShipTreeNodeDef[] = [
  { id: 35, parent: null, lane: 'main' }, // Shuttle
  { id: 8, parent: null, lane: 'main' }, // Frigate
  { id: 12, parent: 8, lane: 'main' }, // Covert Ops
  { id: 14, parent: 8, lane: 'main' }, // Destroyer
  { id: 16, parent: 14, lane: 'main' }, // Cruiser
  { id: 18, parent: 16, lane: 'main' }, // Recon
  { id: 23, parent: 16, lane: 'main' }, // Battlecruiser
  { id: 26, parent: 23, lane: 'main' }, // Battleship
  { id: 27, parent: 26, lane: 'main' }, // Black Ops
  { id: 32, parent: 26, lane: 'main' }, // Dreadnought
  { id: 96, parent: 18, lane: 'branch' }, // Flag Cruiser
  ...BRANCHES.filter((b) => b.id !== 12 && b.id !== 18 && b.id !== 27),
  { id: 36, parent: null, lane: 'industry' }, // Hauler
  { id: 37, parent: 36, lane: 'industry' }, // Freighter
  { id: 40, parent: 36, lane: 'branch' }, // Transport Ship
  { id: 38, parent: 37, lane: 'branch' }, // Jump Freighter
];

const ORE: readonly ShipTreeNodeDef[] = [
  { id: 41, parent: null, lane: 'main' }, // Mining Frigate
  { id: 2108, parent: 41, lane: 'main' }, // Mining Destroyer
  { id: 42, parent: 2108, lane: 'main' }, // Mining Barge

  { id: 2111, parent: 41, lane: 'branch' }, // Faction Mining Frigate
  { id: 48, parent: 41, lane: 'branch' }, // Expedition Frigate
  { id: 2110, parent: 2108, lane: 'branch' }, // Faction Mining Destroyer
  { id: 2112, parent: 2108, lane: 'branch' }, // Mining Command Destroyer
  { id: 43, parent: 42, lane: 'branch' }, // Exhumer

  { id: 44, parent: null, lane: 'industry' }, // ORE Hauler
  { id: 45, parent: 44, lane: 'industry' }, // Industrial Command Ship
  { id: 46, parent: 45, lane: 'industry' }, // Capital Industrial Ship
  { id: 37, parent: 44, lane: 'drop' }, // Freighter (Bowhead)
];

/**
 * The faction's template pruned to the classes it actually has: a class
 * whose parent is missing re-hangs on its nearest present ancestor (Sansha
 * has a Carrier but no Dreadnought, so it hangs off the Battleship). A class
 * the template doesn't know yet is appended as a parentless branch so it
 * still shows up.
 */
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
