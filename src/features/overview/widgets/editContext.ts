/**
 * The Overview's editing seam: whether the page is in Customize mode, and every
 * change the pilot can make to the layout, as one set of actions.
 *
 * The actions live here (not in the components that draw the controls) so the
 * widget menu, the edit bar, the grid's per-widget controls, the Gallery, the
 * Role chooser and the phone list all take the same path: one change in, one
 * Undo toast out, one place that keeps focus sane when a widget goes away.
 * `OverviewEditProvider` builds the value; outside one the actions do nothing,
 * which is what a widget rendered alone (a test, the Gallery's preview) wants.
 */
import { createContext, useContext } from 'react';
import type {
  CalendarEventsChoice,
  RaidsWhere,
  OverviewLayout,
  WidgetRange,
  WidgetInit,
  WidgetScope,
  WidgetSize,
  WidgetView,
} from './layout';
import type { RowsPerPage } from './tableSortPage';

export interface OverviewEditActions {
  /** Add one widget of `kind` at the end, scroll to it and flash it. */
  add: (kind: string, init?: WidgetInit) => void;
  remove: (id: string) => void;
  resize: (id: string, size: WidgetSize) => void;
  duplicate: (id: string) => void;
  /** Back to the default layout, behind the edit bar's confirmation. */
  reset: () => void;
  /** Replace the layout wholesale (Start from a role); undoable. */
  replace: (layout: OverviewLayout) => void;
  /** One place earlier or later among the widgets that are drawn. */
  step: (id: string, direction: 'earlier' | 'later') => void;
  moveTo: (id: string, overId: string) => void;
  moveEdge: (id: string, edge: 'top' | 'bottom') => void;
  setView: (id: string, view: WidgetView) => void;
  setScope: (id: string, scope: WidgetScope) => void;
  setRange: (id: string, range: WidgetRange) => void;
  setRowsPerPage: (id: string, rows: RowsPerPage) => void;
  setPlexPer30Days: (id: string, plex: number) => void;
  setCalendarEvents: (id: string, choice: CalendarEventsChoice) => void;
  setRaidsWhere: (id: string, where: RaidsWhere) => void;
  setRaidsRadius: (id: string, radius: number) => void;
  setTrendItems: (id: string, items: number[]) => void;
  setTrendHubs: (id: string, hubs: string[]) => void;
  rename: (id: string, title: string) => void;
  setShowOnPhone: (id: string, show: boolean) => void;
}

export interface OverviewEdit extends OverviewEditActions {
  editing: boolean;
  startEditing: () => void;
  /** Keep the layout as it is. */
  done: () => void;
  /** Put back the layout as it was when Customize began. */
  cancel: () => void;
  layout: OverviewLayout;
  /** The widget that was just added: the grid scrolls to it and outlines it for a moment. */
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
  setRange: none,
  setRowsPerPage: none,
  setPlexPer30Days: none,
  setCalendarEvents: none,
  setRaidsWhere: none,
  setRaidsRadius: none,
  setTrendItems: none,
  setTrendHubs: none,
  rename: none,
  setShowOnPhone: none,
});

export function useOverviewEdit(): OverviewEdit {
  return useContext(OverviewEditContext);
}
