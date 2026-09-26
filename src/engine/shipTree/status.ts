/**
 * Each hull's standing for one pilot: can they fly it, how long until they
 * can, and which Mastery tier they've reached.
 */
import { computeSkillPlanSchedule } from '@/engine/skillPlanSchedule';
import type { Attributes, CloneState, EngineSkill, Implants, TrainedSkill } from '@/engine/types';
import type { MasteryMap, ShipTreeShip, SkillPrereq } from '@/sde/types';
import type { ShipTreeHullStatus } from './types';

export interface HullStatusContext {
  skills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  cloneState: CloneState;
  now: Date;
}

/**
 * Highest Mastery tier fully trained, walking tiers in order and stopping at
 * the first that is unmet — or empty: a hull with no tier V skills tops out
 * at IV rather than reading as Mastery V.
 */
function masteryReached(
  tiers: readonly (readonly SkillPrereq[])[] | undefined,
  trainedLevel: (skillTypeID: number) => number
): number {
  let reached = 0;
  for (const tier of tiers ?? []) {
    if (tier.length === 0) break;
    if (tier.some((p) => trainedLevel(p.skillTypeID) < p.level)) break;
    reached++;
  }
  return reached;
}

export function hullStatuses(
  ships: readonly ShipTreeShip[],
  masteries: MasteryMap,
  ctx: HullStatusContext
): Map<number, ShipTreeHullStatus> {
  const { skills, trainedSkills, attributes, implants, cloneState, now } = ctx;
  const trainedLevel = (id: number) => trainedSkills.get(id)?.level ?? 0;
  const out = new Map<number, ShipTreeHullStatus>();
  for (const ship of ships) {
    const missing = ship.required.filter((r) => trainedLevel(r.skillTypeID) < r.level);
    const secondsToFly =
      missing.length === 0
        ? 0
        : computeSkillPlanSchedule({
            entries: missing.map((r) => ({ skillTypeID: r.skillTypeID, targetLevel: r.level })),
            skills,
            trainedSkills,
            attributes,
            implants,
            boosters: [],
            markers: undefined,
            markerAttributes: [],
            cloneState,
            startDate: now,
          }).totalSeconds;
    const canFly = missing.length === 0;
    out.set(ship.typeID, {
      canFly,
      secondsToFly,
      mastery: canFly ? masteryReached(masteries[String(ship.typeID)], trainedLevel) : 0,
    });
  }
  return out;
}
