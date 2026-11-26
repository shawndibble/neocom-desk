export type AttributeName = 'intelligence' | 'memory' | 'perception' | 'willpower' | 'charisma';

export type Attributes = Record<AttributeName, number>;

export interface SkillPrereq {
  typeID: number;
  level: number;
}

export interface SkillUnlock {
  typeID: number;
  level: number;
}

export interface EngineSkill {
  typeID: number;
  name: string;
  rank: number;
  primary: AttributeName;
  secondary: AttributeName;
  prereqs: SkillPrereq[];
  alphaMaxLevel?: number;
}

export type CloneState = 'alpha' | 'omega';

export type Implants = Partial<Attributes>;

export interface Booster {
  bonus: Partial<Attributes>;
  startsAt?: Date;
  expiresAt: Date;
}

export interface TrainedSkill {
  level: number;
  sp: number;
}

export type PlanPriority = 'high' | 'normal' | 'low';

export interface PlanEntry {
  skillTypeID: number;
  targetLevel: number;
  priority?: PlanPriority;
}

export interface PlanMilestone {
  id: string;
  name: string;
  skillTypeID: number;
  level: number;
  fittingId?: string;
}

export interface PlanStep {
  skillTypeID: number;
  level: number;
}

export interface ScheduledStep extends PlanStep {
  sp: number;
  seconds: number;
  cumulativeSeconds: number;
}
