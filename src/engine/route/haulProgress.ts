/**
 * Progress along a haul route (issue #4968): which Legs the pilot has ticked
 * done. Progress is a list of Leg ids, never derived from assets (ESI caches
 * them for about an hour) and never from where the pilot is. A Leg is done on
 * its own id, so a repeat visit to one station is ticked separately and a
 * pickup does not stand in for the delivery that follows it.
 *
 * Pure. Ids come from `planHaul`, so they are only meaningful against the plan
 * they were made for.
 */
import type {
  HaulCharacterInput,
  HaulLeg,
  HaulPickupInput,
  HaulPlace,
  HaulPlan,
  HaulSection,
} from './haulPlan';
import { mergeStacks } from './haulLeg';

const sorted = (ids: Iterable<number>): number[] => [...new Set(ids)].sort((a, b) => a - b);

function sectionOf(plan: HaulPlan, legId: number): { section: HaulSection; index: number } | null {
  for (const section of plan.sections) {
    const index = section.legs.findIndex((l) => l.id === legId);
    if (index !== -1) return { section, index };
  }
  return null;
}

/** Ticks a Leg: it and every earlier Leg of its Character's route are done. */
export function tickLeg(plan: HaulPlan, done: readonly number[], legId: number): number[] {
  const found = sectionOf(plan, legId);
  if (!found) return sorted(done);
  return sorted([...done, ...found.section.legs.slice(0, found.index + 1).map((l) => l.id)]);
}

/** Unticks a Leg: it and every later Leg of its Character's route are not done. */
export function untickLeg(plan: HaulPlan, done: readonly number[], legId: number): number[] {
  const found = sectionOf(plan, legId);
  if (!found) return sorted(done);
  const undone = new Set(found.section.legs.slice(found.index).map((l) => l.id));
  return sorted(done.filter((id) => !undone.has(id)));
}

/** The Legs not done, in the planned order. */
export function remainingLegs(section: HaulSection, done: readonly number[]): HaulLeg[] {
  return section.legs.filter((l) => !done.includes(l.id));
}

/** The Leg the pilot flies next, or `null` when the route is finished. */
export function currentLeg(section: HaulSection, done: readonly number[]): HaulLeg | null {
  return remainingLegs(section, done)[0] ?? null;
}

/** Where the pilot is: the end of the last Leg done, else where the route began. */
export function sectionStart(section: HaulSection, done: readonly number[]): HaulPlace | null {
  const lastDone = section.legs.findLast((l) => done.includes(l.id));
  return lastDone ? lastDone.to : (section.legs[0]?.from ?? null);
}

/** Same measures as `HaulPlan.totals`: m³ counts what is loaded, not what is dropped. */
export function remainingTotals(
  plan: HaulPlan,
  done: readonly number[]
): { legs: number; jumps: number; m3: number } {
  const totals = { legs: 0, jumps: 0, m3: 0 };
  for (const section of plan.sections) {
    for (const l of remainingLegs(section, done)) {
      totals.legs += 1;
      totals.jumps += l.jumps ?? 0;
      if (l.kind === 'pickup') totals.m3 += l.m3;
    }
  }
  return totals;
}

/**
 * The Leg the pilot is next flying to, when it ends in `systemId`. Being in a
 * system is not being docked, so this only offers the tick, never makes it.
 */
export function legAtSystem(
  plan: HaulPlan,
  done: readonly number[],
  systemId: number | null
): HaulLeg | null {
  if (systemId === null) return null;
  for (const section of plan.sections) {
    const next = currentLeg(section, done);
    if (next && next.to.systemId === systemId) return next;
  }
  return null;
}

export interface ReplanInputs {
  characters: HaulCharacterInput[];
  /** Characters left out because their hold is loaded and not yet delivered. */
  loaded: string[];
}

/**
 * What a re-plan from here needs: each Character still on the route, starting
 * where they are, with the pickups they have yet to load. A pickup split across
 * trips comes back as one stock. A Character mid-trip (last Leg done was a
 * pickup) is named in `loaded` instead: their cargo has no pickup left to carry
 * it to the destination, so re-planning would lose the delivery.
 */
export function replanInputs(plan: HaulPlan, done: readonly number[]): ReplanInputs {
  const characters: HaulCharacterInput[] = [];
  const loaded: string[] = [];
  for (const section of plan.sections) {
    const left = remainingLegs(section, done);
    if (left.length === 0) continue;
    const lastDone = section.legs.findLast((l) => done.includes(l.id));
    if (lastDone?.kind === 'pickup') {
      loaded.push(section.name);
      continue;
    }
    const stock = new Map<number, HaulPickupInput>();
    for (const l of left) {
      if (l.kind !== 'pickup' || l.locationId === null) continue;
      const seen = stock.get(l.locationId);
      if (seen) {
        seen.m3 += l.m3;
        if (l.stacks) seen.stacks = mergeStacks([...(seen.stacks ?? []), ...l.stacks]);
      } else {
        stock.set(l.locationId, {
          ...l.to,
          locationId: l.locationId,
          m3: l.m3,
          ...(l.stacks ? { stacks: mergeStacks(l.stacks) } : {}),
        });
      }
    }
    characters.push({
      characterId: section.characterId,
      name: section.name,
      start: sectionStart(section, done),
      pickups: [...stock.values()],
      flown: plan.flown.find((f) => f.characterId === section.characterId)?.ships ?? [],
    });
  }
  return { characters, loaded };
}
