/** A killmail's fitted items grouped by slot, each module marked against a doctrine check. Pure. */
import type { DoctrineCheckRecord } from '../srpTypes';

export type FitSlot = 'high' | 'medium' | 'low' | 'rig' | 'subsystem' | 'drone';
export type FitMark = 'doctrine' | 'off' | null;

export interface FitItem {
  item_type_id: number;
  flag: number;
  quantity_destroyed?: number;
  quantity_dropped?: number;
}

export interface FitLine {
  typeId: number;
  count: number;
  mark: FitMark;
}

export interface FitGroup {
  slot: FitSlot;
  lines: FitLine[];
}

// ESI inventory flags: LoSlot0 11, MedSlot0 19, HiSlot0 27, RigSlot0 92, SubSystem0 125; 8 each.
const RACKS: readonly { slot: FitSlot; base: number }[] = [
  { slot: 'high', base: 27 },
  { slot: 'medium', base: 19 },
  { slot: 'low', base: 11 },
  { slot: 'rig', base: 92 },
  { slot: 'subsystem', base: 125 },
];
const DRONE_BAY_FLAG = 87;
const ORDER: readonly FitSlot[] = ['high', 'medium', 'low', 'rig', 'subsystem', 'drone'];

function slotOfFlag(flag: number): FitSlot | null {
  if (flag === DRONE_BAY_FLAG) return 'drone';
  return RACKS.find((r) => flag >= r.base && flag < r.base + 8)?.slot ?? null;
}

/** Modules the check calls extra, as type id -> how many are left to match. */
function extras(check: DoctrineCheckRecord | undefined, rigs: boolean): Map<number, number> {
  const left = new Map<number, number>();
  const ids =
    check?.status === 'off-doctrine'
      ? rigs
        ? check.diff?.extraRigs
        : check.diff?.extraModules
      : [];
  for (const id of ids ?? []) left.set(id, (left.get(id) ?? 0) + 1);
  return left;
}

/**
 * The fitted items by slot (cargo and anything else not in a slot is left out). With a check
 * that ran, a module is `doctrine` unless the diff lists it as extra, then `off`; a drone and
 * every module of an unchecked hull has no mark.
 */
export function fitGroups(
  items: readonly FitItem[],
  check: DoctrineCheckRecord | undefined,
  rackOf?: (typeId: number) => string | undefined
): FitGroup[] {
  const checked = check !== undefined && check.status !== 'not-checked';
  const extraModules = extras(check, false);
  const extraRigs = extras(check, true);
  const bySlot = new Map<FitSlot, Map<number, number>>();
  for (const it of items) {
    const slot = slotOfFlag(it.flag);
    const count = (it.quantity_destroyed ?? 0) + (it.quantity_dropped ?? 0);
    if (slot === null || count < 1) continue;
    // A slot flag also holds the module's loaded charge: only a type that fits the rack is a module.
    if (rackOf && slot !== 'drone' && rackOf(it.item_type_id) !== slot) continue;
    const counts = bySlot.get(slot) ?? new Map<number, number>();
    counts.set(it.item_type_id, (counts.get(it.item_type_id) ?? 0) + count);
    bySlot.set(slot, counts);
  }
  return ORDER.flatMap((slot) => {
    const counts = bySlot.get(slot);
    if (!counts) return [];
    const lines: FitLine[] = [];
    for (const [typeId, count] of counts) {
      if (!checked || slot === 'drone') {
        lines.push({ typeId, count, mark: null });
        continue;
      }
      const extra = slot === 'rig' ? extraRigs : extraModules;
      const offCount = Math.min(count, extra.get(typeId) ?? 0);
      extra.set(typeId, (extra.get(typeId) ?? 0) - offCount);
      if (offCount > 0) lines.push({ typeId, count: offCount, mark: 'off' });
      if (count > offCount) lines.push({ typeId, count: count - offCount, mark: 'doctrine' });
    }
    return [{ slot, lines }];
  });
}

/** Modules and rigs the check calls extra: what "N modules off doctrine" counts. */
export function offDoctrineCount(check: DoctrineCheckRecord | undefined): number {
  if (check?.status !== 'off-doctrine' || !check.diff) return 0;
  return check.diff.extraModules.length + check.diff.extraRigs.length;
}
