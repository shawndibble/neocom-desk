import type { CharacterBoardItemKind } from '@/engine/character/board';

export const KIND_LABEL: Record<CharacterBoardItemKind, string> = {
  calendarEvent: 'calendar.kind.calendarEvent',
  skillTraining: 'calendar.kind.skillTraining',
  accelerator: 'calendar.kind.accelerator',
  industryJob: 'calendar.kind.industryJob',
  planetExtraction: 'calendar.kind.planetExtraction',
  mercenaryDen: 'calendar.kind.mercenaryDen',
  structureTimer: 'calendar.kind.structureTimer',
  structureFuel: 'calendar.kind.structureFuel',
  moonChunk: 'calendar.kind.moonChunk',
  sharedMoonPop: 'calendar.kind.sharedMoonPop',
  corpJob: 'calendar.kind.corpJob',
  skyhookRaid: 'calendar.kind.skyhookRaid',
  contractExpiry: 'calendar.kind.contractExpiry',
  orderExpiry: 'calendar.kind.orderExpiry',
};
