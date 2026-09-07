/**
 * i18n key per kind of clock, in its own module.
 *
 * Lives apart from `CharacterBoardRow` because both that row and the filter
 * menu name kinds, and a constant exported from a component file defeats fast
 * refresh for the whole file (`react-refresh/only-export-components`).
 */
import type { CharacterBoardItemKind } from '@/engine/character/board';

export const KIND_LABEL: Record<CharacterBoardItemKind, string> = {
  calendarEvent: 'calendar.kind.calendarEvent',
  skillTraining: 'calendar.kind.skillTraining',
  industryJob: 'calendar.kind.industryJob',
  planetExtraction: 'calendar.kind.planetExtraction',
  contractExpiry: 'calendar.kind.contractExpiry',
  orderExpiry: 'calendar.kind.orderExpiry',
};
