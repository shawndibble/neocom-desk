export const SOCIAL_SKILL_IDS = {
  connections: 3359,
  criminalConnections: 3361,
  diplomacy: 3357,
} as const;

export interface SocialSkillLevels {
  connections: number;
  criminalConnections: number;
  diplomacy: number;
}

export const NO_SOCIAL_SKILLS: SocialSkillLevels = {
  connections: 0,
  criminalConnections: 0,
  diplomacy: 0,
};

const DISTANCE_CLOSED_PER_LEVEL = 0.04;

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

export const ESI_STANDINGS_ARE_BASE = true;

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
