import type { CharacterBoardItemKind } from '@/engine/character/board';
import type { EsiEndpointId } from '@/esi/registry';

/**
 * The ESI read each kind of clock needs, so a re-login can ask for exactly the
 * Permissions the refused sources lack.
 */
export const KIND_ENDPOINTS: Record<CharacterBoardItemKind, readonly EsiEndpointId[]> = {
  calendarEvent: ['getCharacterCalendar'],
  skillTraining: ['getCharacterSkillQueue'],
  industryJob: ['getCharacterIndustryJobs'],
  planetExtraction: ['getCharacterPlanets'],
  mercenaryDen: ['getCharacterMercenaryDens'],
  structureTimer: ['getCorporationStructures'],
  structureFuel: ['getCorporationStructures'],
  moonChunk: ['getCorporationMiningExtractions'],
  // A callable, not an ESI read: nothing to re-authorise.
  sharedMoonPop: [],
  corpJob: ['getCorporationIndustryJobs'],
  skyhookRaid: ['getCorporationSkyhooks'],
  contractExpiry: ['getCharacterContracts'],
  orderExpiry: ['getCharacterOrders'],
  accelerator: [],
};
