/**
 * The haul route (issue #4965): the ordered Legs a pilot flies to carry a Move
 * plan's pickups to its destination — out to a pickup, on to the next while the
 * hold has room, back to the destination, and again for what is left.
 *
 * Pure. Distances are jump counts from the same sweeps Route Safety's pathfinder
 * runs (`flownJumpDistancesFrom`), under the caller's options, so a leg's
 * jumps agree with the route the leg's Route Safety link draws.
 *
 * Greedy by volume: a trip fills the hold from the nearest pickup that still
 * has stock, a pickup's stock may split across trips, and a pickup is visited
 * once per trip it feeds. Visits count against `MAX_STOPS` per Character;
 * returns to the destination do not. Whatever the plan cannot cover is
 * reported in `leftOut`, never dropped.
 */
import { flownJumpDistancesFrom } from './holeDetour';
import type { FindJumpRouteOptions, JumpGraph } from './jumpRoute';
import { MAX_STOPS } from './tripPlan';

/** A place a Leg starts or ends: a system, plus the station the pilot named there. */
export interface HaulPlace {
  /** `null` when the place resolves to no system. */
  systemId: number | null;
  stationId: number | null;
  name: string;
}

export interface HaulPickupInput extends HaulPlace {
  locationId: number;
  /** Volume to carry from here, in m³. */
  m3: number;
}

export interface HaulCharacterInput {
  characterId: number;
  name: string;
  /** Where the Character is now; `null` when unknown. */
  start: HaulPlace | null;
  pickups: readonly HaulPickupInput[];
  /** Ships this Character flies out rather than hauls: noted, never routed. */
  flown: readonly string[];
}

export interface HaulInput {
  graph: JumpGraph;
  options?: FindJumpRouteOptions;
  characters: readonly HaulCharacterInput[];
  /** The hauler's hold, in m³. */
  capacityM3: number;
  destination: HaulPlace;
  /** Pickup visits per Character; defaults to `MAX_STOPS`. */
  maxStops?: number;
}

export interface HaulLeg {
  /** Index within the whole plan: stable across a re-render and a link round-trip. */
  id: number;
  characterId: number;
  /** 1-based trip this leg belongs to, within its Character. */
  trip: number;
  /** `pickup`: load `m3` at `to`. `delivery`: drop `m3` at the destination. */
  kind: 'pickup' | 'delivery';
  /** `null` for the first leg of a Character whose location is unknown. */
  from: HaulPlace | null;
  to: HaulPlace;
  /** `null` when no gate route joins the ends, or an end has no system. */
  jumps: number | null;
  m3: number;
  /** The pickup location a `pickup` leg loads at. */
  locationId: number | null;
}

export interface HaulSection {
  characterId: number;
  name: string;
  legs: HaulLeg[];
  trips: number;
}

export interface HaulLeftOut {
  characterId: number;
  name: string;
  locationId: number;
  /** The pickup's name. */
  place: string;
  m3: number;
  /** `cap`: past the stop cap. `unplaced`: no system to route to. `noCapacity`: no hold to carry it in. */
  reason: 'cap' | 'unplaced' | 'noCapacity';
}

export interface HaulPlan {
  sections: HaulSection[];
  leftOut: HaulLeftOut[];
  /** Ships flown rather than hauled, by Character; only Characters with any. */
  flown: { characterId: number; name: string; ships: string[] }[];
  totals: { legs: number; jumps: number; m3: number };
}

const EPS = 1e-9;

export function planHaul(input: HaulInput): HaulPlan {
  const { graph, options = {}, characters, capacityM3, destination } = input;
  const maxStops = input.maxStops ?? MAX_STOPS;
  const sweeps = new Map<number, ReadonlyMap<number, number>>();
  const jumpsBetween = (from: number | null, to: number | null): number | null => {
    if (from === null || to === null) return null;
    if (from === to) return 0;
    let sweep = sweeps.get(from);
    if (!sweep) {
      sweep = flownJumpDistancesFrom(graph, from, options);
      sweeps.set(from, sweep);
    }
    return graph.has(to) ? (sweep.get(to) ?? null) : null;
  };

  const sections: HaulSection[] = [];
  const leftOut: HaulLeftOut[] = [];
  const flown: HaulPlan['flown'] = [];
  let nextId = 0;

  for (const c of characters) {
    if (c.flown.length > 0)
      flown.push({ characterId: c.characterId, name: c.name, ships: [...c.flown] });
    const left: { pickup: HaulPickupInput; m3: number }[] = [];
    for (const pickup of c.pickups) {
      if (!(pickup.m3 > EPS)) continue;
      if (capacityM3 <= 0) {
        leftOut.push(leftOutOf(c, pickup, pickup.m3, 'noCapacity'));
      } else if (pickup.systemId === null) {
        leftOut.push(leftOutOf(c, pickup, pickup.m3, 'unplaced'));
      } else {
        left.push({ pickup, m3: pickup.m3 });
      }
    }
    if (left.length === 0) continue;

    const legs: HaulLeg[] = [];
    let visits = 0;
    let trips = 0;
    let capped = false;
    const leg = (
      trip: number,
      kind: HaulLeg['kind'],
      from: HaulPlace | null,
      to: HaulPlace,
      m3: number,
      locationId: number | null
    ) =>
      legs.push({
        id: nextId++,
        characterId: c.characterId,
        trip,
        kind,
        from,
        to,
        jumps: from === null ? null : jumpsBetween(from.systemId, to.systemId),
        m3,
        locationId,
      });

    while (!capped && left.some((l) => l.m3 > EPS)) {
      trips += 1;
      let hold = 0;
      let here: HaulPlace | null = c.start;
      let loaded = false;
      while (hold < capacityM3 - EPS) {
        const open = left.filter((l) => l.m3 > EPS);
        if (open.length === 0) break;
        if (visits >= maxStops) {
          capped = true;
          break;
        }
        const next = nearest(open, here, jumpsBetween);
        const take = Math.min(next.m3, capacityM3 - hold);
        leg(trips, 'pickup', here, next.pickup, take, next.pickup.locationId);
        next.m3 -= take;
        hold += take;
        visits += 1;
        loaded = true;
        here = next.pickup;
      }
      if (!loaded) {
        trips -= 1;
        break;
      }
      leg(trips, 'delivery', here, destination, hold, null);
    }

    for (const l of left) if (l.m3 > EPS) leftOut.push(leftOutOf(c, l.pickup, l.m3, 'cap'));
    sections.push({ characterId: c.characterId, name: c.name, legs, trips });
  }

  const all = sections.flatMap((s) => s.legs);
  return {
    sections,
    leftOut,
    flown,
    totals: {
      legs: all.length,
      jumps: all.reduce((sum, l) => sum + (l.jumps ?? 0), 0),
      m3: all.filter((l) => l.kind === 'pickup').reduce((sum, l) => sum + l.m3, 0),
    },
  };
}

function leftOutOf(
  c: HaulCharacterInput,
  pickup: HaulPickupInput,
  m3: number,
  reason: HaulLeftOut['reason']
): HaulLeftOut {
  return {
    characterId: c.characterId,
    name: c.name,
    locationId: pickup.locationId,
    place: pickup.name,
    m3,
    reason,
  };
}

/** The open pickup fewest jumps from `here`; ties and unknown distances keep input order. */
function nearest<T extends { pickup: HaulPickupInput }>(
  open: readonly T[],
  here: HaulPlace | null,
  jumps: (from: number | null, to: number | null) => number | null
): T {
  if (here === null) return open[0];
  let best = open[0];
  let bestJumps = jumps(here.systemId, best.pickup.systemId) ?? Number.POSITIVE_INFINITY;
  for (const candidate of open.slice(1)) {
    const d = jumps(here.systemId, candidate.pickup.systemId) ?? Number.POSITIVE_INFINITY;
    if (d < bestJumps) {
      best = candidate;
      bestJumps = d;
    }
  }
  return best;
}
