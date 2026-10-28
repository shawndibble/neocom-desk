/**
 * An NPC standing as the game applies it. The standing ESI reports is lifted
 * by the pilot's social skills into the one that gates agents, faction police
 * and reprocessing; broker fees read the unlifted one. Sources:
 * docs/research/npc-standings-rules.md section 3.
 */

/** Skill type ids, verified against `public/data/skills.json`. */
export const SOCIAL_SKILL_IDS = {
  /** Lifts a positive standing toward a lawful entity. */
  connections: 3359,
  /** Lifts a positive standing toward a criminal entity. */
  criminalConnections: 3361,
  /** Lifts a negative standing. */
  diplomacy: 3357,
} as const;

export interface SocialSkillLevels {
  connections: number;
  criminalConnections: number;
  diplomacy: number;
}

/** A pilot with none of the three trained: effective equals base. */
export const NO_SOCIAL_SKILLS: SocialSkillLevels = {
  connections: 0,
  criminalConnections: 0,
  diplomacy: 0,
};

/** Each level closes this share of the distance to +10. */
const DISTANCE_CLOSED_PER_LEVEL = 0.04;

/**
 * `base + (10 - base) * 0.04 * level`, with the one skill that applies: Diplomacy
 * below 0, Connections above 0 for a lawful entity, Criminal Connections above
 * 0 for a criminal one. Exactly 0 gets no skill, so it stays 0.
 */
export function effectiveStanding(
  base: number,
  criminal: boolean,
  skills: SocialSkillLevels
): number {
  if (base === 0) return 0;
  const level =
    base < 0 ? skills.diplomacy : criminal ? skills.criminalConnections : skills.connections;
  return base + (10 - base) * DISTANCE_CLOSED_PER_LEVEL * level;
}

/**
 * UNVERIFIED: `GET /characters/{id}/standings` is assumed to return BASE
 * standings (no CCP source says; one forum post says "raw"). The check is to
 * compare ESI against the in-game Standings tab on a pilot with Connections
 * trained. If ESI turns out to return effective ones, set this to false and
 * every `base` in the app becomes the inverse of that number.
 */
export const ESI_STANDINGS_ARE_BASE = true;

/**
 * The pair for one standing ESI reported: `base` (broker fees) and `effective`
 * (everything else). `esiIsBase` is a parameter only so both readings are
 * testable; callers take the default.
 *
 * The inverse (effective back to base) cannot tell a positive base from a
 * negative one that Diplomacy lifted above 0; it prefers positive.
 */
export function standingsFromEsi(
  esiStanding: number,
  criminal: boolean,
  skills: SocialSkillLevels,
  esiIsBase = ESI_STANDINGS_ARE_BASE
): { base: number; effective: number } {
  if (esiIsBase) {
    return { base: esiStanding, effective: effectiveStanding(esiStanding, criminal, skills) };
  }
  return { base: baseFromEffective(esiStanding, criminal, skills), effective: esiStanding };
}

function baseFromEffective(
  effective: number,
  criminal: boolean,
  skills: SocialSkillLevels
): number {
  if (effective === 0) return 0;
  const positiveShare =
    DISTANCE_CLOSED_PER_LEVEL * (criminal ? skills.criminalConnections : skills.connections);
  const positive = (effective - 10 * positiveShare) / (1 - positiveShare);
  if (positive > 0) return positive;
  const negativeShare = DISTANCE_CLOSED_PER_LEVEL * skills.diplomacy;
  return (effective - 10 * negativeShare) / (1 - negativeShare);
}
