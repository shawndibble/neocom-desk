/**
 * The chain of standings that govern one NPC entity: faction > corporation >
 * agent. There are no NPC alliances. A chain holds only the links that apply
 * (a corporation's has no agent link) and says whether it is "criminal", which
 * picks the skill that lifts its positive standings.
 */
import { standingsFromEsi, type SocialSkillLevels } from './effectiveStanding';

/**
 * The pirate factions CONCORD holds at negative standing: Guristas Pirates,
 * Angel Cartel, Blood Raider Covenant, Sansha's Nation and Serpentis. Ids
 * verified against live ESI `GET /universe/factions` (2026-10-28). Whether the
 * Triglavian Collective or Rogue Drones count is UNVERIFIED; they are left out.
 */
export const CRIMINAL_FACTION_IDS: ReadonlySet<number> = new Set([
  500010, // Guristas Pirates
  500011, // Angel Cartel
  500012, // Blood Raider Covenant
  500019, // Sansha's Nation
  500020, // Serpentis
]);

export function isCriminalFaction(factionId: number | null): boolean {
  return factionId !== null && CRIMINAL_FACTION_IDS.has(factionId);
}

export type ChainKind = 'faction' | 'corporation' | 'agent';

/** One entity in a chain and the standing ESI reports toward it (0 when the pilot has none). */
export interface ChainEntity {
  kind: ChainKind;
  id: number;
  base: number;
}

export interface ChainLink extends ChainEntity {
  /** With the pilot's social skills; what gates agents, faction police and reprocessing. */
  effective: number;
}

export interface StandingChain {
  criminal: boolean;
  /** Faction first, agent last, as given. */
  links: readonly ChainLink[];
}

/** `entities` run faction > corporation > agent; `factionId` is the chain's faction, null when unknown. */
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
