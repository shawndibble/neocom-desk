import type { ConsolidationLine } from '@/engine/assets/consolidation';
import type { MovePlan } from '@/engine/assets/movePlan';
import type {
  HaulCharacterInput,
  HaulLeg,
  HaulPlace,
  HaulPlan,
  HaulPickupInput,
  HaulStack,
} from '@/engine/route/haulPlan';
import { replanInputs } from '@/engine/route/haulProgress';
import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { planLocalHaul } from '@/features/route/localRoute';
import { routeStopsHref } from '@/features/route/routeSafetyLink';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { lookupSolarSystem } from '@/sde/solarSystems';

export interface ActiveHaul {
  id: string;
  createdAt: number;
  capacityM3: number;
  maxIskPerHaul?: number;
  destination: HaulPlace;
  plan: HaulPlan;
  doneLegIds?: number[];
}

function isArrayOfObjects(raw: unknown): raw is Record<string, unknown>[] {
  return Array.isArray(raw) && raw.every((x) => typeof x === 'object' && x !== null);
}

function isStack(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  return (
    typeof s.typeId === 'number' &&
    typeof s.name === 'string' &&
    typeof s.quantity === 'number' &&
    typeof s.unitM3 === 'number' &&
    (s.unitIsk === undefined || typeof s.unitIsk === 'number')
  );
}

function isLeg(leg: Record<string, unknown>): boolean {
  const to = leg.to as Record<string, unknown> | null;
  return (
    (leg.stacks === undefined || (Array.isArray(leg.stacks) && leg.stacks.every(isStack))) &&
    (leg.ships === undefined ||
      (Array.isArray(leg.ships) && leg.ships.every((s) => typeof s === 'string'))) &&
    typeof leg.id === 'number' &&
    typeof leg.m3 === 'number' &&
    (leg.isk === undefined || typeof leg.isk === 'number') &&
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

export const useActiveHaul = createLocalSetting<ActiveHaul | null>({
  key: 'activeHaul',
  defaultValue: null,
  parse: (raw) => (raw === null ? null : parseActiveHaul(raw)),
});

function carriableM3(plan: MovePlan, characterId: number, locationId: number, totalM3: number) {
  const hauled = plan.active?.pickups.find(
    (h) => h.characterId === characterId && h.locationId === locationId
  );
  if (!hauled) return totalM3;
  const lost = [...hauled.unfit, ...hauled.overLimit, ...hauled.tooBigShips].reduce(
    (sum, l) => sum + l.quantity * l.unitM3,
    0
  );
  return Math.max(0, totalM3 - lost);
}

export function carriableStacks(
  plan: MovePlan,
  characterId: number,
  locationId: number,
  lines: readonly ConsolidationLine[],
  name: (typeId: number) => string,
  unitIsk?: ReadonlyMap<number, number>
): HaulStack[] {
  const hauled = plan.active?.pickups.find(
    (h) => h.characterId === characterId && h.locationId === locationId
  );
  const lost = new Map<number, number>();
  for (const l of [
    ...(hauled?.unfit ?? []),
    ...(hauled?.overLimit ?? []),
    ...(hauled?.tooBigShips ?? []),
  ])
    lost.set(l.typeId, (lost.get(l.typeId) ?? 0) + l.quantity);
  const stacks: HaulStack[] = [];
  for (const line of lines) {
    if (line.m3 === null || line.quantity <= 0) continue;
    const quantity = line.quantity - (lost.get(line.typeId) ?? 0);
    if (quantity > 0)
      stacks.push({
        typeId: line.typeId,
        name: name(line.typeId),
        quantity,
        unitM3: line.m3 / line.quantity,
        ...(unitIsk?.has(line.typeId) ? { unitIsk: unitIsk.get(line.typeId) } : {}),
      });
  }
  return stacks;
}

export interface BuildHaulArgs {
  plan: MovePlan;
  destination: HaulPlace;
  places: ReadonlyMap<number, string>;
  systems: ReadonlyMap<number, number | null>;
  stationIds: ReadonlyMap<number, number>;
  unitIsk?: ReadonlyMap<number, number>;
  maxIskPerHaul?: number | null;
  name: (typeId: number) => string;
}

export async function buildActiveHaul(args: BuildHaulArgs): Promise<ActiveHaul | null> {
  const { plan, destination, places, systems, stationIds, name, unitIsk } = args;
  const maxIskPerHaul = args.maxIskPerHaul ?? null;
  const active = plan.active;
  if (!active && plan.totals.shipsToFly === 0) return null;
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
        active?.pickups.find((h) => h.characterId === c.characterId && h.locationId === locationId);
      const pickups: HaulPickupInput[] = c.pickups.map((p) => ({
        locationId: p.locationId,
        systemId: systems.get(p.locationId) ?? null,
        stationId: stationIds.get(p.locationId) ?? null,
        name: places.get(p.locationId) ?? String(p.locationId),
        m3: carriableM3(plan, c.characterId, p.locationId, p.totalM3),
        stacks: carriableStacks(plan, c.characterId, p.locationId, p.lines, name, unitIsk),
        ships: [
          ...p.ships.map((s) => name(s.typeId)),
          ...(hauled(p.locationId)?.tooBigShips.flatMap((s) =>
            Array<string>(s.quantity).fill(name(s.typeId))
          ) ?? []),
        ],
      }));
      return { characterId: c.characterId, name: c.name, start, pickups, flown: [] };
    })
  );
  const result = await planLocalHaul(
    { characters, capacityM3: active?.hull.capacityM3 ?? 0, destination, maxIskPerHaul },
    basis.rules,
    basis.network
  );
  if (result.kind === 'unknown') return null;
  return {
    id: newId(),
    createdAt: Date.now(),
    capacityM3: active?.hull.capacityM3 ?? 0,
    ...(maxIskPerHaul !== null ? { maxIskPerHaul } : {}),
    destination,
    plan: result.plan,
  };
}

export type ReplanResult =
  | { status: 'replanned'; haul: ActiveHaul }
  | { status: 'loaded'; names: string[] }
  | { status: 'unknown' };

export async function replanActiveHaul(haul: ActiveHaul): Promise<ReplanResult> {
  const { characters, loaded } = replanInputs(haul.plan, haul.doneLegIds ?? []);
  if (loaded.length > 0) return { status: 'loaded', names: loaded };
  if (characters.length === 0) return { status: 'unknown' };
  const basis = await loadJumpBasis();
  const result = await planLocalHaul(
    {
      characters,
      capacityM3: haul.capacityM3,
      destination: haul.destination,
      maxIskPerHaul: haul.maxIskPerHaul ?? null,
    },
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
      ...(haul.maxIskPerHaul !== undefined ? { maxIskPerHaul: haul.maxIskPerHaul } : {}),
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

export function legRouteHref(leg: HaulLeg): string | null {
  if (leg.to.systemId === null) return null;
  return routeStopsHref(leg.from?.systemId ?? null, [
    { systemId: leg.to.systemId, stationId: leg.to.stationId },
  ]);
}

export function sectionRouteHref(legs: readonly HaulLeg[], from: HaulPlace | null): string | null {
  const stops = legs.flatMap((leg) =>
    leg.to.systemId === null ? [] : [{ systemId: leg.to.systemId, stationId: leg.to.stationId }]
  );
  return stops.length === 0 ? null : routeStopsHref(from?.systemId ?? null, stops);
}
