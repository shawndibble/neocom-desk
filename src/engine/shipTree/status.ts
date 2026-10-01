/**
 * Each hull's standing for one pilot: can they fly it, how long until they
 * can, and which Mastery tier they've reached.
 */
import { computeSkillPlanSchedule } from '@/engine/skillPlanSchedule';
import type { Attributes, CloneState, EngineSkill, Implants, TrainedSkill } from '@/engine/types';
import type { MasteryMap, ShipTreeShip } from '@/sde/types';
import type { ShipTreeHullStatus } from './types';
import { tiersReached } from '../tierLadder';

export interface HullStatusContext {
  skills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  cloneState: CloneState;
  now: Date;
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
      mastery: canFly ? tiersReached(masteries[String(ship.typeID)], trainedLevel) : 0,
    });
  }
  return out;
}
