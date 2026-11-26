import { createContext, useContext } from 'react';
import type {
  CalendarEventsChoice,
  ProfitSource,
  CampaignFaction,
  RaidsWhere,
  OverviewLayout,
  WidgetRange,
  WidgetInit,
  WidgetScope,
  WidgetShow,
  WidgetSize,
  WidgetView,
} from './layout';
import type { LayerId } from '@/engine/netWorth/series';
import type { CharacterBoardItemKind } from '@/engine/character/board';
import type { RowsPerPage } from './tableSortPage';

export interface OverviewEditActions {
  add: (kind: string, init?: WidgetInit) => void;
  remove: (id: string) => void;
  resize: (id: string, size: WidgetSize) => void;
  duplicate: (id: string) => void;
  reset: () => void;
  replace: (layout: OverviewLayout) => void;
  step: (id: string, direction: 'earlier' | 'later') => void;
  moveTo: (id: string, overId: string) => void;
  moveEdge: (id: string, edge: 'top' | 'bottom') => void;
  setView: (id: string, view: WidgetView) => void;
  setScope: (id: string, scope: WidgetScope) => void;
  setAllScopes: (scope: WidgetScope) => void;
  setRange: (id: string, range: WidgetRange) => void;
  setRowsPerPage: (id: string, rows: RowsPerPage) => void;
  setPlexPer30Days: (id: string, plex: number) => void;
  setCalendarEvents: (id: string, choice: CalendarEventsChoice) => void;
  setHiddenKinds: (id: string, kinds: CharacterBoardItemKind[]) => void;
  setRaidsWhere: (id: string, where: RaidsWhere) => void;
  setRaidsRadius: (id: string, radius: number) => void;
  setProfitSource: (id: string, source: ProfitSource) => void;
  setCampaignFaction: (id: string, faction: CampaignFaction) => void;
  setTrendItems: (id: string, items: number[]) => void;
  setTrendHubs: (id: string, hubs: string[]) => void;
  setHiddenLayers: (id: string, layers: LayerId[]) => void;
  setShow: (id: string, show: WidgetShow) => void;
  rename: (id: string, title: string) => void;
  setShowOnPhone: (id: string, show: boolean) => void;
}

export interface OverviewEdit extends OverviewEditActions {
  editing: boolean;
  startEditing: () => void;
  done: () => void;
  cancel: () => void;
  layout: OverviewLayout;
  flashId: string | null;
}

const none = () => undefined;

export const OverviewEditContext = createContext<OverviewEdit>({
  editing: false,
  startEditing: none,
  done: none,
  cancel: none,
  layout: { version: 1, widgets: [] },
  flashId: null,
  add: none,
  remove: none,
  resize: none,
  duplicate: none,
  reset: none,
  replace: none,
  step: none,
  moveTo: none,
  moveEdge: none,
  setView: none,
  setScope: none,
  setAllScopes: none,
  setRange: none,
  setRowsPerPage: none,
  setPlexPer30Days: none,
  setCalendarEvents: none,
  setHiddenKinds: none,
  setRaidsWhere: none,
  setProfitSource: none,
  setCampaignFaction: none,
  setRaidsRadius: none,
  setTrendItems: none,
  setTrendHubs: none,
  setHiddenLayers: none,
  setShow: none,
  rename: none,
  setShowOnPhone: none,
});

export function useOverviewEdit(): OverviewEdit {
  return useContext(OverviewEditContext);
}
