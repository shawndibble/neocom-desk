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
  /**
   * Highest level an Alpha clone can train (SDE clone grades). Absent or 0:
   * Alphas cannot train this skill at all.
   */
  alphaMaxLevel?: number;
}

/**
 * Alpha or Omega. ESI does not expose it, so the player sets it per character;
 * Alpha trains at half the Omega rate and only up to each skill's Alpha cap.
 */
export type CloneState = 'alpha' | 'omega';

/** Implant bonuses, +0..+5 per attribute. Missing key = +0. */
export type Implants = Partial<Attributes>;

/**
 * Cerebral accelerator: flat attribute bonuses active from `startsAt`
 * (absent = already running) until `expiresAt`.
 */
export interface Booster {
  bonus: Partial<Attributes>;
  /** Absent means already running — live from the start of the schedule. */
  startsAt?: Date;
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

/** Training-order urgency a user assigns to a Skill Plan entry. */
export type PlanPriority = 'high' | 'normal' | 'low';

/** User plan entry: train a skill up to targetLevel. */
export interface PlanEntry {
  skillTypeID: number;
  targetLevel: number;
  /** Absent means 'normal' (#27: Skill priorities and bands). */
  priority?: PlanPriority;
}

/**
 * A named goal ("Fly Loki") pinned to a plan entry's skill level (CONTEXT.md
 * "Plan Milestone"). Anchored to (skillTypeID, level) rather than a position,
 * so it survives reorder and removal by construction — looked up by
 * `skillPlanSchedule.ts`'s `StepKey`, which simply misses when the anchor is
 * gone, where a stored index would silently point at some other step.
 */
export interface PlanMilestone {
  id: string;
  name: string;
  skillTypeID: number;
  level: number;
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
