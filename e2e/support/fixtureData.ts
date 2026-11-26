export const CHARACTER_ID = 90000001;
export const CHARACTER_NAME = 'Test Pilot';
export const OWNER_HASH = 'OWNERHASH1';

export const CORPORATION_ID = 98000001;
export const CORPORATION_NAME = 'Test Corp';
export const ALLIANCE_ID = 99000001;
export const ALLIANCE_NAME = 'Test Alliance';

import { SCOPES as BASE_SCOPES, scopesForGroup } from '../../src/esi/scopes';
import { WRITE_GROUPS } from '../../src/esi/registry';

export const PRE_6102_BASE_SCOPES: readonly string[] = (() => {
  const formerlyOptIn = new Set(
    (
      [
        'corp',
        'structureMarkets',
        'jumpFatigue',
        'corpProjects',
        'killmails',
        'mercenaryDens',
      ] as const
    ).flatMap((group) => scopesForGroup(group))
  );
  return BASE_SCOPES.filter((scope) => !formerlyOptIn.has(scope));
})();

export const SCOPES: readonly string[] = [
  ...new Set([
    ...PRE_6102_BASE_SCOPES,
    ...scopesForGroup('mercenaryDens'),
    ...WRITE_GROUPS.flatMap((group) => scopesForGroup(group)),
  ]),
];

export const SKILL = {
  caldariFrigate: 3330,
  smallHybridTurret: 3301,
  spaceshipCommand: 3327,
  caldariDestroyer: 33092,
  caldariCruiser: 3334,
  gallenteDroneSpecialization: 12486,
} as const;

export const CHARACTER_SKILLS = {
  skills: [
    {
      skill_id: SKILL.caldariFrigate,
      trained_skill_level: 5,
      active_skill_level: 5,
      skillpoints_in_skill: 256_000,
    },
    {
      skill_id: SKILL.smallHybridTurret,
      trained_skill_level: 3,
      active_skill_level: 3,
      skillpoints_in_skill: 8_000,
    },
  ],
  total_sp: 264_000,
  unallocated_sp: 500,
};

export const CHARACTER_ATTRIBUTES = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

export const IMPLANT_IDS = [20001, 20002, 20003];

export const IMPLANT_NAMES: Record<number, string> = {
  20001: 'Ocular Filter - Basic',
  20002: 'Neural Boost - Basic',
  20003: 'Cybernetic Subprocessor - Basic',
};

export const IMPLANT_DESCRIPTIONS: Record<number, string> = {
  20001: 'A <b>basic</b> ocular filter implant.',
  20002: 'A <b>basic</b> neural boost implant.',
  20003: 'A <b>basic</b> cybernetic subprocessor implant.',
};

export const WALLET_BALANCE = 1_234_567_890.12;
export const WALLET_BALANCE_FORMATTED = '1,234,567,890.12';
