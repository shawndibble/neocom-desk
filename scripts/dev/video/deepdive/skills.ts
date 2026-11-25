/**
 * Skill sheets and queues for the cast. Levels come from the bundled skill list
 * (public/data/skills.json): each character gets a level per skill group, with named exceptions.
 */
import { readFileSync } from 'node:fs';
import { HOUR_MS, MINUTE_MS } from '../../../../src/lib/age';
import { ARDEN, MIRA, TOBIN } from './cast';

interface SkillDef {
  typeID: number;
  name: string;
  rank: number;
  groupName: string;
  primaryAttr: string;
  secondaryAttr: string;
}
const SKILLS = JSON.parse(
  readFileSync(new URL('../../../../public/data/skills.json', import.meta.url), 'utf8')
) as SkillDef[];
const BY_NAME = new Map(SKILLS.map((skill) => [skill.name, skill]));
const SP_AT = [0, 250, 1415, 8000, 45255, 256000];

type Level = 0 | 1 | 2 | 3 | 4 | 5;
interface Profile {
  /** Level for a group without an entry. */
  fallback: Level;
  groups: Record<string, Level>;
  /** By skill name; wins over the group. */
  skills: Record<string, Level>;
  attributes: { intelligence: number; memory: number; perception: number; willpower: number; charisma: number };
}

const ARDEN_PROFILE: Profile = {
  fallback: 5,
  groups: { 'Planet Management': 3, 'Structure Management': 3, Subsystems: 3, Sequencing: 2 },
  skills: {
    'Surgical Strike': 4,
    'Rapid Firing': 4,
    'Motion Prediction': 4,
    Sharpshooter: 4,
    'Trajectory Analysis': 4,
    'Controlled Bursts': 4,
    'Drone Interfacing': 4,
    'Heavy Drone Operation': 4,
    'Drone Sharpshooting': 4,
    'Drone Navigation': 4,
    'Gallente Drone Specialization': 3,
    'Minmatar Drone Specialization': 3,
    'Amarr Drone Specialization': 3,
    'Caldari Drone Specialization': 4,
    'Mining Barge': 3,
    Exhumers: 2,
    Reprocessing: 4,
    'Reprocessing Efficiency': 3,
  },
  attributes: { intelligence: 21, memory: 17, perception: 27, willpower: 21, charisma: 19 },
};

const MIRA_PROFILE: Profile = {
  fallback: 3,
  groups: {
    Production: 5,
    Science: 5,
    'Resource Processing': 5,
    'Planet Management': 4,
    Engineering: 5,
    Rigging: 4,
    Sequencing: 4,
    Trade: 4,
    'Structure Management': 4,
    Navigation: 4,
    Gunnery: 2,
    Missiles: 2,
    Drones: 3,
    'Fleet Support': 2,
    'Corporation Management': 3,
  },
  skills: {
    'Advanced Industry': 5,
    'Mass Production': 5,
    'Advanced Mass Production': 4,
    'Mining Barge': 5,
    Exhumers: 4,
    Industry: 5,
    'Spaceship Command': 5,
    'Caldari Cruiser': 4,
    'Caldari Frigate': 4,
    'Minmatar Cruiser': 4,
    'Capital Ship Construction': 2,
    'Capital Industrial Ships': 1,
    'Jump Freighters': 0,
  },
  attributes: { intelligence: 29, memory: 24, perception: 17, willpower: 17, charisma: 17 },
};

const TOBIN_PROFILE: Profile = {
  fallback: 3,
  groups: {
    Navigation: 5,
    Engineering: 5,
    Trade: 4,
    Social: 4,
    Gunnery: 2,
    Missiles: 2,
    Drones: 2,
    Science: 2,
    Production: 2,
    Armor: 4,
    Shields: 4,
    Scanning: 4,
    Targeting: 4,
    'Planet Management': 2,
  },
  skills: {
    'Spaceship Command': 5,
    'Transport Ships': 5,
    'Caldari Hauler': 5,
    'Gallente Hauler': 5,
    'Minmatar Hauler': 5,
    'Amarr Hauler': 5,
    'ORE Hauler': 4,
    'Upwell Hauler': 4,
    'Caldari Freighter': 5,
    'Gallente Freighter': 4,
    'Minmatar Freighter': 4,
    'Amarr Freighter': 3,
    'Jump Freighters': 3,
    'Jump Drive Operation': 5,
    'Jump Drive Calibration': 4,
    'Jump Fuel Conservation': 4,
    'Advanced Spaceship Command': 5,
    'Warp Drive Operation': 5,
    'Evasive Maneuvering': 5,
    'Industrial Command Ships': 4,
    'Mining Barge': 3,
    Exhumers: 2,
  },
  attributes: { intelligence: 21, memory: 20, perception: 22, willpower: 27, charisma: 17 },
};

export const PROFILES = { [ARDEN.id]: ARDEN_PROFILE, [MIRA.id]: MIRA_PROFILE, [TOBIN.id]: TOBIN_PROFILE } as Record<number, Profile>;

function levelOf(profile: Profile, skill: SkillDef): Level {
  return profile.skills[skill.name] ?? profile.groups[skill.groupName] ?? profile.fallback;
}

export function characterSkills(characterId: number) {
  const profile = PROFILES[characterId];
  const skills = SKILLS.map((skill) => {
    const level = levelOf(profile, skill);
    return {
      skill_id: skill.typeID,
      trained_skill_level: level,
      active_skill_level: level,
      skillpoints_in_skill: Math.round(SP_AT[level] * skill.rank),
    };
  }).filter((entry) => entry.trained_skill_level > 0);
  const total = skills.reduce((sum, entry) => sum + entry.skillpoints_in_skill, 0);
  return { skills, total_sp: total, unallocated_sp: characterId === ARDEN.id ? 1_250_000 : 0 };
}

export function characterAttributes(characterId: number) {
  const profile = PROFILES[characterId];
  return {
    ...profile.attributes,
    bonus_remaps: characterId === ARDEN.id ? 1 : 2,
    accrued_remap_cooldown_date: undefined,
    last_remap_date: new Date(Date.now() - 212 * 24 * HOUR_MS).toISOString(),
  };
}

const QUEUES: Record<number, { name: string; to: number; finishInMinutes?: number }[]> = {
  [ARDEN.id]: [
    { name: 'Rapid Firing', to: 5, finishInMinutes: 38 },
    { name: 'Surgical Strike', to: 5 },
    { name: 'Controlled Bursts', to: 5 },
  ],
  [MIRA.id]: [
    { name: 'Advanced Mass Production', to: 5, finishInMinutes: 6 * 60 + 40 },
    { name: 'Caldari Cruiser', to: 5 },
    { name: 'Capital Ship Construction', to: 3 },
  ],
  [TOBIN.id]: [
    { name: 'Gallente Freighter', to: 5, finishInMinutes: 3 * 60 + 15 },
    { name: 'Minmatar Freighter', to: 5 },
    { name: 'Jump Freighters', to: 4 },
    { name: 'Trade', to: 5 },
  ],
};

/** The queue, each entry starting where the one before finishes; the first finishes `finishInMinutes` from now. */
export function characterSkillQueue(characterId: number) {
  const profile = PROFILES[characterId];
  const entries = QUEUES[characterId];
  const rate = (skill: SkillDef) =>
    profile.attributes[skill.primaryAttr as keyof Profile['attributes']] +
    profile.attributes[skill.secondaryAttr as keyof Profile['attributes']] / 2;
  const first = BY_NAME.get(entries[0].name)!;
  const firstDuration = ((SP_AT[entries[0].to] - SP_AT[entries[0].to - 1]) * first.rank) / rate(first);
  let cursor = Date.now() + (entries[0].finishInMinutes ?? 60) * MINUTE_MS - firstDuration * MINUTE_MS;
  return entries.map((entry, index) => {
    const skill = BY_NAME.get(entry.name);
    if (!skill) throw new Error(`skill not found: ${entry.name}`);
    const start = SP_AT[entry.to - 1] * skill.rank;
    const end = SP_AT[entry.to] * skill.rank;
    const duration = ((end - start) / rate(skill)) * MINUTE_MS;
    const row = {
      queue_position: index,
      skill_id: skill.typeID,
      finished_level: entry.to,
      start_date: new Date(cursor).toISOString(),
      finish_date: new Date(cursor + duration).toISOString(),
      level_start_sp: start,
      level_end_sp: end,
      training_start_sp: start,
    };
    cursor += duration;
    return row;
  });
}

/** What the character skill list should hold for a queued skill: the level before the queue's target. */
export { SKILLS };
