/**
 * One glyph per kind of clock, from the app's own vocabulary — the same icons
 * those routes carry in the nav. The rail's rows, the filter menu (the legend)
 * and the map's day cells all draw it in the kind's hue, so a kind is told
 * apart by shape as well as colour (DESIGN.md §7).
 *
 * Its own module for the reason `calendarKindLabels.ts` gives: a constant
 * exported from a component file defeats fast refresh.
 */
import type { CharacterBoardItemKind } from '@/engine/character/board';
import * as Icon from '@/components/ui/icons';

export const KIND_ICON: Record<CharacterBoardItemKind, typeof Icon.Skills> = {
  calendarEvent: Icon.CalendarEvent,
  skillTraining: Icon.Skills,
  industryJob: Icon.Industry,
  planetExtraction: Icon.Planetary,
  mercenaryDen: Icon.MercenaryDen,
  moonChunk: Icon.MoonMining,
  skyhookRaid: Icon.PiSkyhook,
  contractExpiry: Icon.Contracts,
  orderExpiry: Icon.Orders,
  skillPlan: Icon.FlatList,
};
