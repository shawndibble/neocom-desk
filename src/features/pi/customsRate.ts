/**
 * The customs rate a planetary chain is costed at, and where that number came
 * from.
 *
 * `engine/pi/chain.ts` deliberately never derives a rate — security status
 * only ever moves it, and the engine takes it as a parameter. This is the
 * feature-layer half of that split: it turns "which space is the colony in"
 * plus "what has this character trained" into a starting rate the user can
 * then override.
 *
 * Customs Code Expertise reduces the *empire* (NPC) portion by 10% of it per
 * level — one percentage point off the 10% highsec base, so 10% untrained and
 * 5% at V. Outside highsec a player-owned POCO has no NPC component for the
 * skill to reduce, so the skill does nothing there and the default is 0: the
 * owner's tax is whatever they set, which nothing in ESI reports. A vestigial
 * NPC office in lowsec charges 17% that the skill cannot touch either — also
 * a user override, not a default.
 *
 * `customsRateSource` exists so the UI can say where the number came from,
 * and — the part that matters — can tell "trained to 0" apart from "no skill
 * data at all". Rendering the untrained 10% as if it were measured would be
 * exactly the confident-wrong-number the colony `unknown` state avoids.
 */

/** SDE typeID of Customs Code Expertise. */
export const CUSTOMS_CODE_EXPERTISE_SKILL_ID = 33467;

/** The security band a colony sits in. Sets the *default* rate only; never yield. */
export type ColonySpace = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole';

export const COLONY_SPACES: readonly ColonySpace[] = [
  'highsec',
  'lowsec',
  'nullsec',
  'wormhole',
] as const;

/** The highsec NPC base, before any POCO owner tax. Mirrors the engine's own default. */
const HIGHSEC_NPC_BASE_RATE = 0.1;

/** One percentage point of the base per level, i.e. 10% of it. */
const PER_LEVEL_REDUCTION = 0.01;

const MAX_SKILL_LEVEL = 5;

/**
 * The highsec NPC rate at a trained level. `null` — no skill data — is treated
 * as untrained: it is the only assumption that cannot understate what the
 * customs office will actually charge.
 */
export function highsecCustomsRate(level: number | null): number {
  const clamped = level == null ? 0 : Math.min(Math.max(Math.trunc(level), 0), MAX_SKILL_LEVEL);
  return HIGHSEC_NPC_BASE_RATE - clamped * PER_LEVEL_REDUCTION;
}

/** The rate a freshly-picked band starts at. Always user-editable afterwards. */
export function defaultCustomsRate(space: ColonySpace, level: number | null): number {
  return space === 'highsec' ? highsecCustomsRate(level) : 0;
}

/**
 * Provenance for the rate above, so the UI can state it rather than presenting
 * a bare number.
 */
export type CustomsRateSource =
  | { kind: 'highsec-skill'; level: number }
  | { kind: 'highsec-unknown-skill' }
  | { kind: 'player-poco'; space: ColonySpace };

export function customsRateSource(space: ColonySpace, level: number | null): CustomsRateSource {
  if (space !== 'highsec') return { kind: 'player-poco', space };
  if (level == null) return { kind: 'highsec-unknown-skill' };
  return {
    kind: 'highsec-skill',
    level: Math.min(Math.max(Math.trunc(level), 0), MAX_SKILL_LEVEL),
  };
}
