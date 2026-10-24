/**
 * The active haul (issue #4965): a Move plan's Haul route, saved as a local
 * snapshot when the pilot clicks Show my route. It has its own id and is never
 * recomputed from the plan afterwards, so re-planning the move cannot move a
 * Leg under a pilot who is already underway. Device-local, never synced.
 */
import type { MovePlan } from '@/engine/assets/movePlan';
import type {
  HaulCharacterInput,
  HaulLeg,
  HaulPlace,
  HaulPlan,
  HaulPickupInput,
} from '@/engine/route/haulPlan';
import { replanInputs } from '@/engine/route/haulProgress';
import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { planLocalHaul } from '@/features/route/localRoute';
import { routeStopsHref } from '@/features/route/routeSafetyLink';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { lookupSolarSystem } from '@/sde/solarSystems';

export interface ActiveHaul {
  /** Names this snapshot; a replacement gets a new one. */
  id: string;
  createdAt: number;
  capacityM3: number;
  destination: HaulPlace;
  plan: HaulPlan;
  /**
   * Ids of the Legs ticked done (#4968). Kept on the snapshot, so it is keyed
   * to `id`: a replacement or a re-plan starts with none. Absent means none.
   */
  doneLegIds?: number[];
}

function isArrayOfObjects(raw: unknown): raw is Record<string, unknown>[] {
  return Array.isArray(raw) && raw.every((x) => typeof x === 'object' && x !== null);
}

function isLeg(leg: Record<string, unknown>): boolean {
  const to = leg.to as Record<string, unknown> | null;
  return (
    typeof leg.id === 'number' &&
    typeof leg.m3 === 'number' &&
    (leg.kind === 'pickup' || leg.kind === 'delivery') &&
    typeof to === 'object' &&
    to !== null &&
    typeof to.name === 'string'
  );
}

function parseActiveHaul(raw: unknown): ActiveHaul | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const plan = r.plan as Record<string, unknown> | undefined;
  if (
    typeof r.id !== 'string' ||
    typeof r.createdAt !== 'number' ||
    typeof r.capacityM3 !== 'number' ||
    typeof r.destination !== 'object' ||
    r.destination === null ||
    typeof plan !== 'object' ||
    plan === null ||
    !isArrayOfObjects(plan.sections) ||
    !plan.sections.every((s) => isArrayOfObjects(s.legs) && s.legs.every(isLeg)) ||
    !isArrayOfObjects(plan.leftOut) ||
    !Array.isArray(plan.flown) ||
    typeof plan.totals !== 'object' ||
    plan.totals === null ||
    (r.doneLegIds !== undefined &&
      !(Array.isArray(r.doneLegIds) && r.doneLegIds.every((n) => typeof n === 'number')))
  )
    return null;
  return raw as ActiveHaul;
}

/** The saved active haul, or `null` for none. */
export const useActiveHaul = createLocalSetting<ActiveHaul | null>({
  key: 'activeHaul',
  defaultValue: null,
  parse: (raw) => (raw === null ? null : parseActiveHaul(raw)),
});

/** One pickup's m³ the hauler can actually carry: unfit stacks and too-big ships are left out. */
function carriableM3(plan: MovePlan, characterId: number, locationId: number, totalM3: number) {
  const hauled = plan.active?.pickups.find(
    (h) => h.characterId === characterId && h.locationId === locationId
  );
  if (!hauled) return totalM3;
  const lost = [...hauled.unfit, ...hauled.tooBigShips].reduce(
    (sum, l) => sum + l.quantity * l.unitM3,
    0
  );
  return Math.max(0, totalM3 - lost);
}

export interface BuildHaulArgs {
  plan: MovePlan;
  destination: HaulPlace;
  /** Pickup location name by location id. */
  places: ReadonlyMap<number, string>;
  /** Solar system of each pickup location. */
  systems: ReadonlyMap<number, number | null>;
  /** The station or structure a pickup location is, for the stop's tag; absent for a container. */
  stationIds: ReadonlyMap<number, number>;
  name: (typeId: number) => string;
}

/**
 * Works the Haul route out for a plan under the saved Jump Basis, from each
 * Character's Current System. `null` when the plan has no hauler to plan with
 * or the stargate snapshot cannot be read.
 */
export async function buildActiveHaul(args: BuildHaulArgs): Promise<ActiveHaul | null> {
  const { plan, destination, places, systems, stationIds, name } = args;
  const active = plan.active;
  if (!active) return null;
  const basis = await loadJumpBasis();
  const characters: HaulCharacterInput[] = await Promise.all(
    plan.perCharacter.map(async (c) => {
      const systemId = await loadCurrentSystemId(c.characterId).catch(() => null);
      const entry = systemId === null ? null : await lookupSolarSystem(systemId).catch(() => null);
      const start: HaulPlace | null =
        systemId === null
          ? null
          : { systemId, stationId: null, name: entry?.name ?? String(systemId) };
      const hauled = (locationId: number) =>
        active.pickups.find((h) => h.characterId === c.characterId && h.locationId === locationId);
      const pickups: HaulPickupInput[] = c.pickups.map((p) => ({
        locationId: p.locationId,
        systemId: systems.get(p.locationId) ?? null,
        stationId: stationIds.get(p.locationId) ?? null,
        name: places.get(p.locationId) ?? String(p.locationId),
        m3: carriableM3(plan, c.characterId, p.locationId, p.totalM3),
      }));
      const flown = c.pickups.flatMap((p) => [
        ...p.ships.map((s) => name(s.typeId)),
        ...(hauled(p.locationId)?.tooBigShips.map((s) => name(s.typeId)) ?? []),
      ]);
      return { characterId: c.characterId, name: c.name, start, pickups, flown };
    })
  );
  const result = await planLocalHaul(
    { characters, capacityM3: active.hull.capacityM3, destination },
    basis.rules,
    basis.network
  );
  if (result.kind === 'unknown') return null;
  return {
    id: newId(),
    createdAt: Date.now(),
    capacityM3: active.hull.capacityM3,
    destination,
    plan: result.plan,
  };
}

export type ReplanResult =
  | { status: 'replanned'; haul: ActiveHaul }
  /** A Character's hold is loaded and not yet delivered: re-planning would lose that delivery. */
  | { status: 'loaded'; names: string[] }
  /** The stargate snapshot could not be read, or nothing is left to plan. */
  | { status: 'unknown' };

/**
 * Re-optimises what is left of a haul from where each Character is (#4968).
 * The new snapshot has its own id and no ticks: Leg ids restart with the new
 * plan. Only on the pilot's ask; a tick never re-orders the route.
 */
export async function replanActiveHaul(haul: ActiveHaul): Promise<ReplanResult> {
  const { characters, loaded } = replanInputs(haul.plan, haul.doneLegIds ?? []);
  if (loaded.length > 0) return { status: 'loaded', names: loaded };
  if (characters.length === 0) return { status: 'unknown' };
  const basis = await loadJumpBasis();
  const result = await planLocalHaul(
    { characters, capacityM3: haul.capacityM3, destination: haul.destination },
    basis.rules,
    basis.network
  );
  if (result.kind === 'unknown') return { status: 'unknown' };
  return {
    status: 'replanned',
    haul: {
      id: newId(),
      createdAt: Date.now(),
      capacityM3: haul.capacityM3,
      destination: haul.destination,
      plan: { ...result.plan, leftOut: [...result.plan.leftOut, ...haul.plan.leftOut] },
    },
  };
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Route Safety opened on one Leg: from its origin system to its destination stop, station tag and all. */
export function legRouteHref(leg: HaulLeg): string | null {
  if (leg.to.systemId === null) return null;
  return routeStopsHref(leg.from?.systemId ?? null, [
    { systemId: leg.to.systemId, stationId: leg.to.stationId },
  ]);
}

/** Route Safety through every stop of `legs` in order, from `from`: a Character's whole route in one trip. */
export function sectionRouteHref(legs: readonly HaulLeg[], from: HaulPlace | null): string | null {
  const stops = legs.flatMap((leg) =>
    leg.to.systemId === null ? [] : [{ systemId: leg.to.systemId, stationId: leg.to.stationId }]
  );
  return stops.length === 0 ? null : routeStopsHref(from?.systemId ?? null, stops);
}
