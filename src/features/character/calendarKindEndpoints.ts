import type { CharacterBoardItemKind } from '@/engine/character/board';
import type { EsiEndpointId } from '@/esi/registry';

/**
 * The ESI read each kind of clock needs, so a re-login can ask for exactly the
 * Permissions the refused sources lack. `skillPlan` reads nothing from ESI.
 */
export const KIND_ENDPOINTS: Record<CharacterBoardItemKind, readonly EsiEndpointId[]> = {
  calendarEvent: ['getCharacterCalendar'],
  skillTraining: ['getCharacterSkillQueue'],
  industryJob: ['getCharacterIndustryJobs'],
  planetExtraction: ['getCharacterPlanets'],
  mercenaryDen: ['getCharacterMercenaryDens'],
  moonChunk: ['getCorporationMiningExtractions'],
  skyhookRaid: ['getCorporationSkyhooks'],
  contractExpiry: ['getCharacterContracts'],
  orderExpiry: ['getCharacterOrders'],
  skillPlan: [],
};
