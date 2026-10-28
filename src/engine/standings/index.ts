/**
 * NPC standings engine: pure functions over a pilot's standings and social
 * skills. Rules and sources: docs/design/mockups/npc-standings/. Standings are
 * -10..10; "base" is what ESI reports (assumed, see `ESI_STANDINGS_ARE_BASE`),
 * "effective" is base lifted by Connections / Criminal Connections / Diplomacy.
 *
 * Effective standing (effectiveStanding.ts)
 *   effectiveStanding(base, criminal, skills): number
 *   standingsFromEsi(esiStanding, criminal, skills): { base, effective }
 *   ESI_STANDINGS_ARE_BASE, SOCIAL_SKILL_IDS, NO_SOCIAL_SKILLS, SocialSkillLevels
 *
 * Chain: faction > corporation > agent (chain.ts)
 *   standingChain(entities, factionId, skills): StandingChain
 *   isCriminalFaction(factionId): boolean;  CRIMINAL_FACTION_IDS
 *   ChainLink { kind, id, base, effective };  StandingChain { criminal, links }
 *
 * Agent access (agentAccess.ts)
 *   highestAccessLevel(chain): AgentLevel        1..5, never below 1
 *   nextLevel(chain): { level, needs, short } | null
 *   agentAccess(chain, agentLevel): { open, needs, short, blockedBy }
 *   bestLink(chain), blockingLink(chain)         the bold link; the -2.0 veto
 *   AGENT_LEVELS, AGENT_LEVEL_STANDING, AGENT_BLOCK_STANDING
 *
 * At NPC stations (stationFees.ts)
 *   reprocessingTaxPct(stationTakePct, effectiveCorpStanding): percent
 *   brokerFeeComparison(brokerRelationsLevel, baseFaction, baseCorp): { atZeroPct, atYoursPct, savingPct }
 *   DEFAULT_STATION_TAKE_PCT, ZERO_REPROCESSING_TAX_STANDING
 */
export * from './agentAccess';
export * from './chain';
export * from './effectiveStanding';
export * from './stationFees';
