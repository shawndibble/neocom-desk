import type { HoldStats } from '@/engine/fittings/types';

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
export type HoldKind = 'general' | SpecialisedHoldKind;

export const HOLD_KINDS: readonly HoldKind[] = ['general', ...SPECIALISED_HOLD_KINDS];

export function isHoldKind(value: unknown): value is HoldKind {
  return typeof value === 'string' && (HOLD_KINDS as readonly string[]).includes(value);
}

export interface CargoHold {
  kind: HoldKind;
  capacityM3: number;
}

export interface HoldItem {
  groupId: number | null;
  categoryId: number | null;
}

interface Accepts {
  categoryIds: readonly number[];
  groupIds: readonly number[];
}

const ACCEPTS: Record<SpecialisedHoldKind, Accepts> = {
  ammo: { categoryIds: [8], groupIds: [] },
  planetary: { categoryIds: [42, 43], groupIds: [] },
  commandCenter: { categoryIds: [], groupIds: [1027] },
  mineral: { categoryIds: [], groupIds: [18] },
  gas: { categoryIds: [], groupIds: [711] },
  mining: { categoryIds: [25], groupIds: [711] },
  ice: { categoryIds: [], groupIds: [465] },
  fuel: { categoryIds: [], groupIds: [423] },
  infrastructure: {
    categoryIds: [43, 65, 66, 39, 40],
    groupIds: [
      4729, 1136, 423, 427, 4086, 4777, 4778, 4779, 1546, 1547, 1548, 1549, 1551, 4186, 4736, 1106,
      1027, 1246, 1250,
    ],
  },
};

export function holdAccepts(kind: HoldKind, item: HoldItem): boolean {
  if (kind === 'general') return true;
  const { categoryIds, groupIds } = ACCEPTS[kind];
  return (
    (item.groupId !== null && groupIds.includes(item.groupId)) ||
    (item.categoryId !== null && categoryIds.includes(item.categoryId))
  );
}

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

export function holdsFromStats(stats: HoldStats): CargoHold[] {
  const general = stats.cargo + stats.fleetHangar;
  const holds: CargoHold[] = general > 0 ? [{ kind: 'general', capacityM3: general }] : [];
  for (const kind of SPECIALISED_HOLD_KINDS) {
    const capacityM3 = stats[STAT_OF[kind]];
    if (capacityM3 > 0) holds.push({ kind, capacityM3 });
  }
  return holds;
}
