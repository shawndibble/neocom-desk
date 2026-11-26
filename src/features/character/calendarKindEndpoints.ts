import type { CharacterBoardItemKind } from '@/engine/character/board';
import type { EsiEndpointId } from '@/esi/registry';

export const KIND_ENDPOINTS: Record<CharacterBoardItemKind, readonly EsiEndpointId[]> = {
  calendarEvent: ['getCharacterCalendar'],
  skillTraining: ['getCharacterSkillQueue'],
  industryJob: ['getCharacterIndustryJobs'],
  planetExtraction: ['getCharacterPlanets'],
  mercenaryDen: ['getCharacterMercenaryDens'],
  structureTimer: ['getCorporationStructures'],
  structureFuel: ['getCorporationStructures'],
  moonChunk: ['getCorporationMiningExtractions'],
  sharedMoonPop: [],
  corpJob: ['getCorporationIndustryJobs'],
  skyhookRaid: ['getCorporationSkyhooks'],
  contractExpiry: ['getCharacterContracts'],
  orderExpiry: ['getCharacterOrders'],
  accelerator: [],
};
