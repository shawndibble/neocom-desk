import type { CharacterAttributes, CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';
import type { Attributes, AttributeName } from '@/engine/types';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { walletFixtureRoutes } from '@/storybook/esiFixtureRoutes';
import { MINUTE_MS, DAY_MS } from '@/lib/age';

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

export const MIXED_QUEUE: readonly QueuedSkill[] = [
  { skillTypeID: 3338, level: 5, rank: 8, ...PW },
  { skillTypeID: 3326, level: 5, rank: 5, ...PW },
  { skillTypeID: 20212, level: 3, rank: 8, ...PW },
  { skillTypeID: 20212, level: 4, rank: 8, ...PW },
  { skillTypeID: 20315, level: 5, rank: 5, ...PW },
  { skillTypeID: 12441, level: 5, rank: 2, ...PW },
  { skillTypeID: 3419, level: 5, rank: 3, ...IM },
  { skillTypeID: 3420, level: 5, rank: 4, ...IM },
  { skillTypeID: 3418, level: 5, rank: 3, ...IM },
  { skillTypeID: 3424, level: 5, rank: 2, ...IM },
  { skillTypeID: 28164, level: 4, rank: 3, ...IM },
  { skillTypeID: 3441, level: 5, rank: 5, ...MP },
  { skillTypeID: 3442, level: 5, rank: 5, ...MP },
];

export const MISSILE_QUEUE: readonly QueuedSkill[] = MIXED_QUEUE.slice(0, 6);

export const BALANCED: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

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

export const HEAD_DONE_FRACTION = 0.03;

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

function trainedSkills(queue: readonly QueuedSkill[]): CharacterSkill[] {
  const firstQueued = new Map<number, QueuedSkill>();
  for (const skill of queue)
    if (!firstQueued.has(skill.skillTypeID)) firstQueued.set(skill.skillTypeID, skill);
  const base: [number, number, number][] = [
    [3319, 5, 1],
    [3334, 5, 5],
    [3330, 5, 2],
    [3426, 5, 1],
    [3413, 5, 1],
    [3449, 5, 1],
    [3436, 5, 1],
    [3416, 5, 1],
    [3425, 5, 2],
    [3411, 4, 3],
    [21071, 5, 2],
    [20314, 5, 2],
    [3321, 5, 2],
    [3324, 5, 3],
    [3402, 5, 1],
    [3327, 5, 1],
    [33096, 4, 6],
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
