import type { CharacterBoardItemKind } from '@/engine/character/board';

export const KIND_FILL: Record<CharacterBoardItemKind, string> = {
  calendarEvent: 'bg-kind-calendar-event',
  skillTraining: 'bg-kind-skill-training',
  accelerator: 'bg-kind-accelerator',
  industryJob: 'bg-kind-industry-job',
  planetExtraction: 'bg-kind-planet-extraction',
  mercenaryDen: 'bg-kind-mercenary-den',
  structureTimer: 'bg-kind-structure-timer',
  structureFuel: 'bg-kind-structure-fuel',
  moonChunk: 'bg-kind-moon-chunk',
  sharedMoonPop: 'bg-kind-shared-moon-pop',
  corpJob: 'bg-kind-corp-job',
  skyhookRaid: 'bg-kind-skyhook-raid',
  contractExpiry: 'bg-kind-contract-expiry',
  orderExpiry: 'bg-kind-order-expiry',
};

export const KIND_TEXT: Record<CharacterBoardItemKind, string> = {
  calendarEvent: 'text-kind-calendar-event',
  skillTraining: 'text-kind-skill-training',
  accelerator: 'text-kind-accelerator',
  industryJob: 'text-kind-industry-job',
  planetExtraction: 'text-kind-planet-extraction',
  mercenaryDen: 'text-kind-mercenary-den',
  structureTimer: 'text-kind-structure-timer',
  structureFuel: 'text-kind-structure-fuel',
  moonChunk: 'text-kind-moon-chunk',
  sharedMoonPop: 'text-kind-shared-moon-pop',
  corpJob: 'text-kind-corp-job',
  skyhookRaid: 'text-kind-skyhook-raid',
  contractExpiry: 'text-kind-contract-expiry',
  orderExpiry: 'text-kind-order-expiry',
};

export function kindSegmentClassName(kind: CharacterBoardItemKind): string {
  return `flex-1 ${KIND_FILL[kind]}`;
}
