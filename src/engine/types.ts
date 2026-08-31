/** Pure skill-training engine types. Decoupled from src/sde — callers adapt their data to these shapes. */

export type AttributeName = 'intelligence' | 'memory' | 'perception' | 'willpower' | 'charisma';

/** Attribute point values (base + remap, before implants/boosters). */
export type Attributes = Record<AttributeName, number>;

export interface SkillPrereq {
  typeID: number;
  level: number;
}

/**
 * One entry in a skill's reverse-prereq list: the skill it unlocks, and the
 * level of *this* skill (the map key) required to unlock it. Same shape as
 * SkillPrereq but the inverse direction — named separately so the two are
 * never confused.
 */
export interface SkillUnlock {
  typeID: number;
  level: number;
}

/** Minimal skill shape the engine needs (adapt SDE data to this). */
export interface EngineSkill {
  typeID: number;
  name: string;
  /** Training time multiplier (rank). */
  rank: number;
  primary: AttributeName;
  secondary: AttributeName;
  prereqs: SkillPrereq[];
}

/** Implant bonuses, +0..+5 per attribute. Missing key = +0. */
export type Implants = Partial<Attributes>;

/** Cerebral accelerator: flat attribute bonuses active until expiry. */
export interface Booster {
  bonus: Partial<Attributes>;
  expiresAt: Date;
}

export interface TrainedSkill {
  level: number;
  sp: number;
}

export interface CharacterSheet {
  /** Base + remap allocation (min 17, max 27 per attribute). */
  attributes: Attributes;
  implants: Implants;
  trainedSkills: Map<number, TrainedSkill>;
}

/** User plan entry: train a skill up to targetLevel. */
export interface PlanEntry {
  skillTypeID: number;
  targetLevel: number;
  /**
   * Import-sourced priority (1-highest .. lower-priority), carried over from
   * other planners' plan files. Not yet consumed by any engine logic here —
   * preserved for the future skill-priorities feature.
   */
  priority?: number;
}

/** Normalized single-level training step. */
export interface PlanStep {
  skillTypeID: number;
  level: number;
}

export interface ScheduledStep extends PlanStep {
  sp: number;
  seconds: number;
  cumulativeSeconds: number;
}
