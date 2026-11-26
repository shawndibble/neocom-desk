import { normalizeMaxIsk } from '@/engine/assets/haulPacking';
import { flownJumpDistancesFrom } from './holeDetour';
import type { FindJumpRouteOptions, JumpGraph } from './jumpRoute';
import { MAX_STOPS } from './tripPlan';

export interface HaulPlace {
  systemId: number | null;
  stationId: number | null;
  name: string;
}

export interface HaulStack {
  typeId: number;
  name: string;
  quantity: number;
  unitM3: number;
  unitIsk?: number;
}

export interface HaulPickupInput extends HaulPlace {
  locationId: number;
  m3: number;
  stacks?: readonly HaulStack[];
  ships?: readonly string[];
}

export interface HaulCharacterInput {
  characterId: number;
  name: string;
  start: HaulPlace | null;
  pickups: readonly HaulPickupInput[];
  flown: readonly string[];
}

export interface HaulInput {
  graph: JumpGraph;
  options?: FindJumpRouteOptions;
  characters: readonly HaulCharacterInput[];
  capacityM3: number;
  destination: HaulPlace;
  maxStops?: number;
  maxIskPerHaul?: number | null;
}

export interface HaulLeg {
  id: number;
  characterId: number;
  trip: number;
  kind: 'pickup' | 'delivery';
  from: HaulPlace | null;
  to: HaulPlace;
  jumps: number | null;
  m3: number;
  isk?: number;
  locationId: number | null;
  stacks?: HaulStack[];
  ships?: string[];
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
  place: string;
  m3: number;
  reason: 'cap' | 'unplaced' | 'noCapacity' | 'overLimit';
}

export interface HaulPlan {
  sections: HaulSection[];
  leftOut: HaulLeftOut[];
  flown: { characterId: number; name: string; ships: string[] }[];
  totals: { legs: number; jumps: number; m3: number };
}

export function mergeStacks(stacks: readonly HaulStack[]): HaulStack[] {
  const byType = new Map<number, HaulStack>();
  for (const s of stacks) {
    const seen = byType.get(s.typeId);
    if (seen) seen.quantity += s.quantity;
    else byType.set(s.typeId, { ...s });
  }
  return [...byType.values()];
}

const EPS = 1e-9;

export function planHaul(input: HaulInput): HaulPlan {
  const { graph, options = {}, characters, capacityM3, destination } = input;
  const maxStops = input.maxStops ?? MAX_STOPS;
  const maxIsk = normalizeMaxIsk(input.maxIskPerHaul);
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
    const left: { pickup: HaulPickupInput; m3: number; stacks: HaulStack[] | null }[] = [];
    for (const pickup of c.pickups) {
      if (!(pickup.m3 > EPS)) continue;
      if (capacityM3 <= 0) {
        leftOut.push(leftOutOf(c, pickup, pickup.m3, 'noCapacity'));
      } else if (pickup.systemId === null) {
        leftOut.push(leftOutOf(c, pickup, pickup.m3, 'unplaced'));
      } else {
        left.push({ pickup, m3: pickup.m3, stacks: pickup.stacks?.map((s) => ({ ...s })) ?? null });
      }
    }
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
      locationId: number | null,
      stacks?: HaulStack[],
      ships?: string[],
      isk?: number
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
        ...(isk !== undefined ? { isk } : {}),
        locationId,
        ...(stacks ? { stacks } : {}),
        ...(ships ? { ships } : {}),
      });

    const valued = c.pickups.some((p) => p.stacks?.some((s) => s.unitIsk !== undefined));
    let start: HaulPlace | null = c.start;
    while (!capped && left.some((l) => l.m3 > EPS)) {
      trips += 1;
      let hold = 0;
      let holdIsk = 0;
      const full = new Set<unknown>();
      let here: HaulPlace | null = start;
      let loaded = false;
      while (hold < capacityM3 - EPS) {
        const open = left.filter((l) => l.m3 > EPS && !full.has(l));
        if (open.length === 0) break;
        if (visits >= maxStops) {
          capped = true;
          break;
        }
        const next = nearest(open, here, jumpsBetween);
        const limited = maxIsk !== null && (next.stacks?.length ?? 0) > 0;
        let take = Math.min(next.m3, capacityM3 - hold);
        let stacks: HaulStack[] | undefined;
        if (limited) {
          stacks = takeStacks(next.stacks!, take, false, maxIsk - holdIsk);
          take = stacks.reduce((sum, s) => sum + s.quantity * s.unitM3, 0);
          next.m3 = next.stacks!.reduce((sum, s) => sum + s.quantity * s.unitM3, 0);
          if (stacks.length === 0) {
            if (hold > 0) {
              full.add(next);
              continue;
            }
            leftOut.push(leftOutOf(c, next.pickup, next.m3, 'overLimit'));
            next.m3 = 0;
            continue;
          }
        } else {
          const last = next.m3 - take <= EPS;
          stacks = next.stacks ? takeStacks(next.stacks, take, last, null) : undefined;
          next.m3 -= take;
        }
        const isk = stacks?.reduce((sum, s) => sum + s.quantity * (s.unitIsk ?? 0), 0);
        leg(
          trips,
          'pickup',
          here,
          next.pickup,
          take,
          next.pickup.locationId,
          stacks,
          undefined,
          valued ? isk : undefined
        );
        holdIsk += isk ?? 0;
        hold += take;
        visits += 1;
        loaded = true;
        here = next.pickup;
        if (maxIsk !== null && holdIsk >= maxIsk - EPS) break;
      }
      if (!loaded) {
        trips -= 1;
        break;
      }
      leg(
        trips,
        'delivery',
        here,
        destination,
        hold,
        null,
        undefined,
        undefined,
        valued ? holdIsk : undefined
      );
      start = destination;
    }

    for (const l of left) if (l.m3 > EPS) leftOut.push(leftOutOf(c, l.pickup, l.m3, 'cap'));

    const flights: { pickup: HaulPickupInput; ship: string }[] = [];
    for (const p of c.pickups) {
      for (const ship of p.ships ?? []) {
        if (p.systemId === null) {
          const note = flown.find((f) => f.characterId === c.characterId);
          if (note) note.ships.push(ship);
          else flown.push({ characterId: c.characterId, name: c.name, ships: [ship] });
        } else flights.push({ pickup: p, ship });
      }
    }
    while (flights.length > 0) {
      const next = nearest(flights, start, jumpsBetween);
      flights.splice(flights.indexOf(next), 1);
      trips += 1;
      leg(trips, 'pickup', start, next.pickup, 0, next.pickup.locationId, undefined, [next.ship]);
      leg(trips, 'delivery', next.pickup, destination, 0, null, undefined, [next.ship]);
      start = destination;
    }

    if (left.length === 0 && legs.length === 0) continue;
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

function takeStacks(
  stacks: HaulStack[],
  m3: number,
  last: boolean,
  iskRoom: number | null
): HaulStack[] {
  const taken: HaulStack[] = [];
  let room = m3;
  for (const s of stacks) {
    if (s.quantity <= 0) continue;
    const fit = s.unitM3 > 0 ? Math.floor((room + EPS) / s.unitM3) : s.quantity;
    let n = last ? s.quantity : Math.min(s.quantity, fit);
    const unitIsk = s.unitIsk ?? 0;
    if (iskRoom !== null && unitIsk > 0) n = Math.min(n, Math.floor((iskRoom + EPS) / unitIsk));
    if (n <= 0) continue;
    taken.push({ ...s, quantity: n });
    s.quantity -= n;
    room -= n * s.unitM3;
    if (iskRoom !== null) iskRoom -= n * unitIsk;
  }
  return taken;
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
