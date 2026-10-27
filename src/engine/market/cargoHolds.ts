/**
 * Cargo Space as a set of holds: the general hold (cargo hold plus fleet
 * hangar, which take anything) and the Specialised Holds, each taking only
 * certain contents.
 *
 * What a hold accepts is not in the SDE, ESI or Hoboleaks — it lives in
 * client code — so this is a hand-maintained table, kept to the rows the
 * #2450 scope decision confirms
 * (`docs/context/decisions/20261004-101406-cargo-space-counts-specialised-holds-whose-contents-fit.md`).
 * Anything unconfirmed is left out and rides in the general hold: the plan
 * may understate a load but never plans one that does not fit.
 *
 * Pure: no fetch/DOM/Dexie.
 */
import type { HoldStats } from '@/engine/fittings/types';

/**
 * The Specialised Holds, narrowest first: when two accept the same item
 * (an ice product in a fuel bay or an infrastructure hold, a gas cloud in a
 * gas or a mining hold), the Trip Plan fills them in this order.
 */
export const SPECIALISED_HOLD_KINDS = [
  'commandCenter',
  'mineral',
  'gas',
  'ice',
  'fuel',
  'ammo',
  'planetary',
  'mining',
  'infrastructure',
] as const;

export type SpecialisedHoldKind = (typeof SPECIALISED_HOLD_KINDS)[number];
/** `general` is the cargo hold plus fleet hangar, or a typed "Any item" hold. */
export type HoldKind = 'general' | SpecialisedHoldKind;

export const HOLD_KINDS: readonly HoldKind[] = ['general', ...SPECIALISED_HOLD_KINDS];

export function isHoldKind(value: unknown): value is HoldKind {
  return typeof value === 'string' && (HOLD_KINDS as readonly string[]).includes(value);
}

export interface CargoHold {
  kind: HoldKind;
  capacityM3: number;
}

/** An item as a hold sees it; null where the SDE group (or its category) is unknown. */
export interface HoldItem {
  groupId: number | null;
  categoryId: number | null;
}

interface Accepts {
  categoryIds: readonly number[];
  groupIds: readonly number[];
}

/** Category and group ids per Specialised Hold, from the scope decision's table (sources there). */
const ACCEPTS: Record<SpecialisedHoldKind, Accepts> = {
  // Category 8 (Charge): ammo, scripts, cap boosters, crystals, probes, nanite paste. EVE University, Hoarder.
  ammo: { categoryIds: [8], groupIds: [] },
  // Categories 42 (P0) and 43 (P1–P4). EVE University, Haulers.
  planetary: { categoryIds: [42, 43], groupIds: [] },
  // Group 1027 (Command Centers). EVE University, Haulers.
  commandCenter: { categoryIds: [], groupIds: [1027] },
  // Group 18 (Mineral). EVE University, Haulers.
  mineral: { categoryIds: [], groupIds: [18] },
  // Group 711 (Harvestable Cloud); compressed gas (4168) unconfirmed, left out. EVE University, Hoarder.
  gas: { categoryIds: [], groupIds: [711] },
  // Category 25 (Asteroid: ore, moon ore, ice, compressed) and group 711. Patch notes 19.11.
  mining: { categoryIds: [25], groupIds: [711] },
  // Group 465 (Ice, compressed ice included); not ice products. Forum: "Make ice hold more versatile".
  ice: { categoryIds: [], groupIds: [465] },
  // Group 423 (Ice Product); fuel blocks (1136) unconfirmed, left out. EVE University, Haulers.
  fuel: { categoryIds: [], groupIds: [423] },
  // Patch notes 22.01 and hotfixes, the forum's exhaustive item list and CCP_Swift's post.
  infrastructure: {
    categoryIds: [43, 65, 66, 39, 40],
    groupIds: [
      4729, 1136, 423, 427, 4086, 4777, 4778, 4779, 1546, 1547, 1548, 1549, 1551, 4186, 4736, 1106,
      1027, 1246, 1250,
    ],
  },
};

/** Whether `kind` takes `item`. The general hold takes anything; a Specialised Hold only what its table row lists. */
export function holdAccepts(kind: HoldKind, item: HoldItem): boolean {
  if (kind === 'general') return true;
  const { categoryIds, groupIds } = ACCEPTS[kind];
  return (
    (item.groupId !== null && groupIds.includes(item.groupId)) ||
    (item.categoryId !== null && categoryIds.includes(item.categoryId))
  );
}

/** The `HoldStats` field each Specialised Hold's capacity is read from. */
const STAT_OF: Record<SpecialisedHoldKind, keyof HoldStats> = {
  commandCenter: 'commandCenterHold',
  mineral: 'mineralHold',
  gas: 'gasHold',
  ice: 'iceHold',
  fuel: 'fuelBay',
  ammo: 'ammoHold',
  planetary: 'planetaryHold',
  mining: 'miningHold',
  infrastructure: 'infrastructureHold',
};

/** A ship's Cargo Space from its Fitting stats: the general hold, then each Specialised Hold it has. */
export function holdsFromStats(stats: HoldStats): CargoHold[] {
  const general = stats.cargo + stats.fleetHangar;
  const holds: CargoHold[] = general > 0 ? [{ kind: 'general', capacityM3: general }] : [];
  for (const kind of SPECIALISED_HOLD_KINDS) {
    const capacityM3 = stats[STAT_OF[kind]];
    if (capacityM3 > 0) holds.push({ kind, capacityM3 });
  }
  return holds;
}
