import type { CharacterBoardItemKind } from '@/engine/character/board';
import * as Icon from '@/components/ui/icons';

export const KIND_ICON: Record<CharacterBoardItemKind, typeof Icon.Skills> = {
  calendarEvent: Icon.CalendarEvent,
  skillTraining: Icon.Skills,
  accelerator: Icon.Accelerator,
  industryJob: Icon.Industry,
  planetExtraction: Icon.Planetary,
  mercenaryDen: Icon.MercenaryDen,
  structureTimer: Icon.StructureTimer,
  structureFuel: Icon.StructureFuel,
  moonChunk: Icon.MoonMining,
  sharedMoonPop: Icon.SharedMoonPop,
  corpJob: Icon.Industry,
  skyhookRaid: Icon.PiSkyhook,
  contractExpiry: Icon.NavContracts,
  orderExpiry: Icon.Orders,
};
