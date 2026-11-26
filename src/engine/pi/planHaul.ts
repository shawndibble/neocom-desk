import { sum } from '../math';
import { securityBand } from '@/engine/securityStatus';

export type ShipClass = 'frigate' | 'industrial' | 'epithal';

export const HAUL_SHIPS: readonly { id: ShipClass; label: string; m3: number }[] = [
  { id: 'frigate', label: 'Frigate cargo', m3: 400 },
  { id: 'industrial', label: 'Industrial hauler', m3: 5_000 },
  { id: 'epithal', label: 'Epithal planetary bay', m3: 45_000 },
];

export interface HaulFit {
  fits: Record<ShipClass, boolean>;
  smallest: ShipClass | null;
  industrialTrips: number;
}

export function haulFit(m3: number | null): HaulFit | null {
  if (m3 === null || !Number.isFinite(m3) || m3 < 0) return null;
  const fits = Object.fromEntries(HAUL_SHIPS.map((ship) => [ship.id, m3 <= ship.m3])) as Record<
    ShipClass,
    boolean
  >;
  return {
    fits,
    smallest: HAUL_SHIPS.find((ship) => m3 <= ship.m3)?.id ?? null,
    industrialTrips: Math.max(
      1,
      Math.ceil(m3 / (HAUL_SHIPS.find((ship) => ship.id === 'industrial')?.m3 ?? 5_000))
    ),
  };
}

export interface RouteSystem {
  systemId: number;
  security: number | null;
}

export interface RouteExposure {
  jumps: number;
  lowsec: number | null;
  nullsec: number | null;
}

export function routeExposure(route: readonly RouteSystem[] | null): RouteExposure | null {
  if (route === null) return null;
  const entered = route.slice(1);
  const known = entered.every((system) => system.security !== null);
  const count = (band: 'lowsec' | 'nullsec') =>
    known
      ? entered.filter((system) => securityBand(system.security as number) === band).length
      : null;
  return { jumps: entered.length, lowsec: count('lowsec'), nullsec: count('nullsec') };
}

export interface HaulColony {
  planetId: number;
  m3PerDay: number | null;
  todayM3PerDay: number | null;
  route: readonly RouteSystem[] | 'local' | null;
}

export type HaulRoute =
  | { kind: 'local' }
  | { kind: 'unknown' }
  | {
      kind: 'route';
      farthestPlanetId: number;
      jumps: number;
      lowsec: number | null;
      nullsec: number | null;
    };

export interface HaulSummary {
  haulDays: number;
  restartDays: number;
  tripsPerWeek: number;
  m3PerTrip: number | null;
  todayM3PerTrip: number | null;
  complete: boolean;
  fit: HaulFit | null;
  route: HaulRoute;
}

function sumKnown(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : sum(known);
}

export function haulSummary(input: {
  haulDays: number;
  restartDays: number;
  colonies: readonly HaulColony[];
}): HaulSummary {
  const { haulDays, restartDays, colonies } = input;
  const perTrip = (perDay: number | null) => (perDay === null ? null : perDay * haulDays);
  const m3PerDay = sumKnown(colonies.map((colony) => colony.m3PerDay));
  const todayM3PerDay = sumKnown(colonies.map((colony) => colony.todayM3PerDay));
  const m3PerTrip = perTrip(m3PerDay);

  let route: HaulRoute;
  if (colonies.length === 0 || colonies.every((colony) => colony.route === 'local')) {
    route = { kind: 'local' };
  } else if (colonies.some((colony) => colony.route === null)) {
    route = { kind: 'unknown' };
  } else {
    let farthest: { planetId: number; exposure: RouteExposure } | null = null;
    for (const colony of colonies) {
      if (colony.route === 'local' || colony.route === null) continue;
      const exposure = routeExposure(colony.route);
      if (exposure && (!farthest || exposure.jumps > farthest.exposure.jumps)) {
        farthest = { planetId: colony.planetId, exposure };
      }
    }
    route = farthest
      ? { kind: 'route', farthestPlanetId: farthest.planetId, ...farthest.exposure }
      : { kind: 'unknown' };
  }

  return {
    haulDays,
    restartDays,
    tripsPerWeek: 7 / haulDays,
    m3PerTrip,
    todayM3PerTrip: perTrip(todayM3PerDay),
    complete: colonies.every((colony) => colony.m3PerDay !== null),
    fit: haulFit(m3PerTrip),
    route,
  };
}
