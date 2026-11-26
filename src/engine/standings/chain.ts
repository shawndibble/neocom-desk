import { standingsFromEsi, type SocialSkillLevels } from './effectiveStanding';

export const CRIMINAL_FACTION_IDS: ReadonlySet<number> = new Set([
  500010, 500011, 500012, 500019, 500020,
]);

export function isCriminalFaction(factionId: number | null): boolean {
  return factionId !== null && CRIMINAL_FACTION_IDS.has(factionId);
}

export type ChainKind = 'faction' | 'corporation' | 'agent';

export interface ChainEntity {
  kind: ChainKind;
  id: number;
  base: number;
}

export interface ChainLink extends ChainEntity {
  effective: number;
}

export interface StandingChain {
  criminal: boolean;
  links: readonly ChainLink[];
}

export function standingChain(
  entities: readonly ChainEntity[],
  factionId: number | null,
  skills: SocialSkillLevels
): StandingChain {
  const criminal = isCriminalFaction(factionId);
  return {
    criminal,
    links: entities.map((entity) => ({
      ...entity,
      ...standingsFromEsi(entity.base, criminal, skills),
    })),
  };
}
