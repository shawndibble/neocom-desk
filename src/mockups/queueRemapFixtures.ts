import type { CharacterAttributes, CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';
import type { Attributes, AttributeName } from '@/engine/types';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { walletFixtureRoutes } from '@/storybook/esiFixtureRoutes';
import { MINUTE_MS, DAY_MS } from '@/lib/age';

/**
 * Sample skill data for the #4701 mockup (remap advice from the skill queue):
 * a Caldari missile pilot whose queue is a long Perception/Willpower block
 * (battleship and cruise missiles) followed by an Intelligence/Memory block
 * (shields and capacitor) and two Memory/Perception drone skills. Ranks and
 * attributes are the SDE's (`public/data/skills.json`); finish dates are
 * worked out from the sheet, the way EVE would report them.
 */

interface QueuedSkill {
  skillTypeID: number;
  level: number;
  rank: number;
  primary: AttributeName;
  secondary: AttributeName;
}

const PW = { primary: 'perception', secondary: 'willpower' } as const;
const IM = { primary: 'intelligence', secondary: 'memory' } as const;
const MP = { primary: 'memory', secondary: 'perception' } as const;

/** Missiles and the hull first, then the tank and capacitor block, then drones. */
export const MIXED_QUEUE: readonly QueuedSkill[] = [
  { skillTypeID: 3338, level: 5, rank: 8, ...PW }, // Caldari Battleship
  { skillTypeID: 3326, level: 5, rank: 5, ...PW }, // Cruise Missiles
  { skillTypeID: 20212, level: 3, rank: 8, ...PW }, // Cruise Missile Specialization
  { skillTypeID: 20212, level: 4, rank: 8, ...PW },
  { skillTypeID: 20315, level: 5, rank: 5, ...PW }, // Warhead Upgrades
  { skillTypeID: 12441, level: 5, rank: 2, ...PW }, // Missile Bombardment
  { skillTypeID: 3419, level: 5, rank: 3, ...IM }, // Shield Management
  { skillTypeID: 3420, level: 5, rank: 4, ...IM }, // Tactical Shield Manipulation
  { skillTypeID: 3418, level: 5, rank: 3, ...IM }, // Capacitor Management
  { skillTypeID: 3424, level: 5, rank: 2, ...IM }, // Energy Grid Upgrades
  { skillTypeID: 28164, level: 4, rank: 3, ...IM }, // Thermodynamics
  { skillTypeID: 3441, level: 5, rank: 5, ...MP }, // Heavy Drone Operation
  { skillTypeID: 3442, level: 5, rank: 5, ...MP }, // Drone Interfacing
];

/** Only the missile block: one attribute pair end to end. */
export const MISSILE_QUEUE: readonly QueuedSkill[] = MIXED_QUEUE.slice(0, 6);

/** EVE's even start: 99 points, Charisma the dump stat. */
export const BALANCED: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

/** Already remapped for missiles: the best a Perception/Willpower queue can have. */
export const PERCEPTION_WILLPOWER: Attributes = {
  intelligence: 17,
  memory: 17,
  perception: 27,
  willpower: 21,
  charisma: 17,
};

function levelSp(rank: number, level: number): number {
  return level <= 0 ? 0 : Math.ceil(250 * rank * Math.pow(Math.sqrt(32), level - 1));
}

/** How far into the head skill training is: a few percent, so the optimizer's whole-queue figures and the page's remaining time agree to within hours. */
export const HEAD_DONE_FRACTION = 0.03;

/** ESI's queue for `queue` trained on `attrs`, the head just started. */
export function queueEntries(
  queue: readonly QueuedSkill[],
  attrs: Attributes,
  nowMs: number
): SkillQueueEntry[] {
  let cursor = nowMs;
  return queue.map((skill, index) => {
    const start = levelSp(skill.rank, skill.level - 1);
    const end = levelSp(skill.rank, skill.level);
    const perMinute = attrs[skill.primary] + attrs[skill.secondary] / 2;
    const totalMs = ((end - start) / perMinute) * MINUTE_MS;
    const doneFraction = index === 0 ? HEAD_DONE_FRACTION : 0;
    const startMs = index === 0 ? nowMs - totalMs * doneFraction : cursor;
    const finishMs = startMs + totalMs;
    cursor = finishMs;
    return {
      skill_id: skill.skillTypeID,
      queue_position: index,
      finished_level: skill.level,
      start_date: new Date(startMs).toISOString(),
      finish_date: new Date(finishMs).toISOString(),
      level_start_sp: start,
      level_end_sp: end,
      training_start_sp: Math.round(start + (end - start) * doneFraction),
    };
  });
}

/** Trained levels: every queued skill one level below its first queued level, plus a filled-out sheet. */
function trainedSkills(queue: readonly QueuedSkill[]): CharacterSkill[] {
  const firstQueued = new Map<number, QueuedSkill>();
  for (const skill of queue)
    if (!firstQueued.has(skill.skillTypeID)) firstQueued.set(skill.skillTypeID, skill);
  const base: [number, number, number][] = [
    // [typeID, level, rank] — prerequisites and the usual support skills.
    [3319, 5, 1], // Missile Launcher Operation
    [3334, 5, 5], // Caldari Cruiser
    [3330, 5, 2], // Caldari Frigate
    [3426, 5, 1], // CPU Management
    [3413, 5, 1], // Power Grid Management
    [3449, 5, 1], // Navigation
    [3436, 5, 1], // Drones
    [3416, 5, 1], // Shield Operation
    [3425, 5, 2], // Shield Upgrades
    [3411, 4, 3], // Cybernetics
    [21071, 5, 2], // Rapid Launch
    [20314, 5, 2], // Target Navigation Prediction
    [3321, 5, 2], // Light Missiles
    [3324, 5, 3], // Heavy Missiles
    [3402, 5, 1], // Science
    [3327, 5, 1], // Spaceship Command
    [33096, 4, 6], // Caldari Battlecruiser
  ];
  const rows: CharacterSkill[] = base.map(([skill_id, level, rank]) => ({
    skill_id,
    active_skill_level: level,
    trained_skill_level: level,
    skillpoints_in_skill: levelSp(rank, level),
  }));
  for (const skill of firstQueued.values()) {
    const level = skill.level - 1;
    rows.push({
      skill_id: skill.skillTypeID,
      active_skill_level: level,
      trained_skill_level: level,
      skillpoints_in_skill: levelSp(skill.rank, level),
    });
  }
  return rows;
}

export interface QueueRemapScenario {
  queue: readonly QueuedSkill[];
  attributes: Attributes;
  bonusRemaps: number;
  /** Days until the yearly remap is off cooldown; 0 or less = ready now. */
  yearlyInDays: number;
}

export const SCENARIOS = {
  ready: { queue: MIXED_QUEUE, attributes: BALANCED, bonusRemaps: 0, yearlyInDays: -40 },
  cooldown: { queue: MIXED_QUEUE, attributes: BALANCED, bonusRemaps: 0, yearlyInDays: 130 },
  bonus: { queue: MIXED_QUEUE, attributes: BALANCED, bonusRemaps: 1, yearlyInDays: -40 },
  optimal: {
    queue: MISSILE_QUEUE,
    attributes: PERCEPTION_WILLPOWER,
    bonusRemaps: 0,
    yearlyInDays: -40,
  },
  empty: { queue: [], attributes: BALANCED, bonusRemaps: 0, yearlyInDays: -40 },
} satisfies Record<string, QueueRemapScenario>;

export type ScenarioName = keyof typeof SCENARIOS;

export function scenarioAttributes(
  scenario: QueueRemapScenario,
  nowMs: number
): CharacterAttributes {
  return {
    ...scenario.attributes,
    bonus_remaps: scenario.bonusRemaps,
    accrued_remap_cooldown_date: new Date(nowMs + scenario.yearlyInDays * DAY_MS).toISOString(),
    last_remap_date: new Date(nowMs + (scenario.yearlyInDays - 365) * DAY_MS).toISOString(),
  };
}

export const QUEUE_REMAP_SCOPES: readonly string[] = [
  'esi-wallet.read_character_wallet.v1',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-clones.read_implants.v1',
];

/** The wallet routes the shell reads, plus this scenario's skills, queue, sheet and (no) implants. */
export function queueRemapRoutes(name: ScenarioName): () => FixtureRoute[] {
  const scenario = SCENARIOS[name];
  return () => {
    const nowMs = Date.now();
    const own = String.raw`^/characters/\d+`;
    const at = (tail: string) => new RegExp(`${own}${tail}$`);
    const skills = trainedSkills(MIXED_QUEUE);
    return [
      ...walletFixtureRoutes(),
      {
        path: at('/skills'),
        respond: () => ({
          body: {
            skills,
            total_sp: 48_612_000,
            unallocated_sp: 0,
          },
        }),
      },
      {
        path: at('/skillqueue'),
        respond: () => ({ body: queueEntries(scenario.queue, scenario.attributes, nowMs) }),
      },
      { path: at('/attributes'), respond: () => ({ body: scenarioAttributes(scenario, nowMs) }) },
      { path: at('/implants'), respond: () => ({ body: [] }) },
      { path: at('/clones'), respond: () => ({ body: { jump_clones: [] } }) },
    ];
  };
}
