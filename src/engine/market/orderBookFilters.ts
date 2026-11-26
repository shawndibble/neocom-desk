import { classifySpace, SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { withinJumpRange } from '@/engine/route/jumpRange';

export function systemsInSpace(
  systems: Iterable<{ id: number; name: string; security: number }>,
  kinds: ReadonlySet<SpaceKind>
): ReadonlySet<number> | null {
  if (SPACE_KINDS.every((kind) => kinds.has(kind))) return null;
  const allowed = new Set<number>();
  for (const system of systems) {
    if (kinds.has(classifySpace(system.name, system.security))) allowed.add(system.id);
  }
  return allowed;
}

export function intersectSystemSets(
  a: ReadonlySet<number> | null,
  b: ReadonlySet<number> | null
): ReadonlySet<number> | null {
  if (a === null) return b;
  if (b === null) return a;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const both = new Set<number>();
  for (const id of small) if (large.has(id)) both.add(id);
  return both;
}

export interface OrderFilters {
  allowedSystems?: ReadonlySet<number> | null;
  minQuantity?: number;
  npcStationIds?: ReadonlySet<number> | null;
}

export function passesOrderFilters(
  order: { system_id?: number | null; location_id: number; volume_remain: number },
  filters: OrderFilters
): boolean {
  if (!withinJumpRange(order.system_id, filters.allowedSystems ?? null)) return false;
  if (filters.minQuantity && order.volume_remain < filters.minQuantity) return false;
  if (filters.npcStationIds && !filters.npcStationIds.has(order.location_id)) return false;
  return true;
}
