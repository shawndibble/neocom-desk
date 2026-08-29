/**
 * Shared fixture constants for the fully-mocked E2E surface (mockSso +
 * mockEsi + specs). One character, one set of ESI-derived data — kept in
 * one place so every spec asserts against the same numbers.
 *
 * Skill typeIDs are picked from public/data/skills.json so that no trained
 * skill's own name collides with its SDE group name (the Skills page
 * renders both a group heading and a skill name — see skills.spec.ts).
 */

export const CHARACTER_ID = 90000001;
export const CHARACTER_NAME = 'Test Pilot';
export const OWNER_HASH = 'OWNERHASH1';

export const CORPORATION_ID = 98000001;
export const CORPORATION_NAME = 'Test Corp';
export const ALLIANCE_ID = 99000001;
export const ALLIANCE_NAME = 'Test Alliance';

/** Requested SSO scopes, echoed into the mocked JWT's `scp` claim. */
export const SCOPES = [
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-clones.read_implants.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-mail.read_mail.v1',
  'esi-calendar.read_calendar_events.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-markets.read_character_orders.v1',
  'esi-characters.read_blueprints.v1',
] as const;

/**
 * Skill typeIDs from public/data/skills.json. Caldari Cruiser's prereq
 * chain (Spaceship Command -> Caldari Destroyer -> Caldari Destroyer's own
 * prereq Caldari Frigate) is used by plans.spec.ts to exercise prereq
 * insertion; Caldari Frigate is pre-trained so only Spaceship Command and
 * Caldari Destroyer show up as inserted prereq steps.
 */
export const SKILL = {
  /** name "Caldari Frigate", group "Spaceship Command". Pre-trained to V. */
  caldariFrigate: 3330,
  /** name "Small Hybrid Turret", group "Gunnery". Pre-trained to III. */
  smallHybridTurret: 3301,
  /** name "Spaceship Command", group "Spaceship Command". Untrained. */
  spaceshipCommand: 3327,
  /** name "Caldari Destroyer", group "Spaceship Command". Untrained. */
  caldariDestroyer: 33092,
  /** name "Caldari Cruiser", group "Spaceship Command". Added via picker. */
  caldariCruiser: 3334,
} as const;

/** Character skills fixture: total_sp + unallocated_sp asserted verbatim in skills.spec.ts. */
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

/** Flat spread: not optimal for a perception/willpower-heavy plan, so "optimize remaps" always finds savings. */
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
/** Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(WALLET_BALANCE). */
export const WALLET_BALANCE_FORMATTED = '1,234,567,890.12';
