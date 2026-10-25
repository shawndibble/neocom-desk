/**
 * The Overview Layout and the pure reducers that edit it.
 *
 * Every reducer returns a new layout and never mutates its input; one that
 * would change nothing returns the very same object, so a caller can tell "no
 * change" by identity and skip the write (and the Undo toast). Widget ids come
 * from a caller-supplied `makeId`, so tests stay deterministic.
 *
 * No React, Dexie or fetch here: the store lives in `layoutStore.ts`.
 */
import { DEFAULT_PLEX_PER_30_DAYS } from '@/engine/omegaCoverage';
import { TREND_MAX_SERIES } from '@/engine/market/trendSeries';
import { getTradeHub } from '@/market/hubs';
import { isRowsPerPage, DEFAULT_ROWS_PER_PAGE, type RowsPerPage } from './tableSortPage';
import { getKind, isAddable, type WidgetKindId, type WidgetSize, type WidgetView } from './kinds';

export type { WidgetKindId, WidgetSize, WidgetView };

export type WidgetScope = 'header' | 'all';
export type CalendarEventsChoice = 'committed' | 'all';
export const CALENDAR_EVENTS_CHOICES: readonly CalendarEventsChoice[] = ['committed', 'all'];

/** Skyhook raids: whose space it lists. Alliance is the default and is never stored. */
export type RaidsWhere = 'alliance' | 'near';
export const RAIDS_WHERES: readonly RaidsWhere[] = ['alliance', 'near'];
/** Jumps from the Current System under Near me; not a WidgetRange, which counts days. */
export const RAIDS_RADII: readonly number[] = [5, 8, 10, 15];
export const DEFAULT_RAIDS_RADIUS = 8;
export const isRaidsRadius = (value: unknown): value is number =>
  typeof value === 'number' && RAIDS_RADII.includes(value);

export type WidgetRange = 7 | 30 | 90 | 365;
export const WIDGET_RANGES: readonly WidgetRange[] = [7, 30, 90];
/** What a price-history kind offers: ESI keeps about 13 months of market history. */
export const LONG_WIDGET_RANGES: readonly WidgetRange[] = [7, 30, 90, 365];
export const DEFAULT_RANGE: WidgetRange = 30;

/** The windows a kind offers, or none for a kind with no time window. */
export function rangesOf(kind: WidgetKindId): readonly WidgetRange[] {
  const def = getKind(kind);
  if (!def?.hasRange) return [];
  return def.hasLongRange ? LONG_WIDGET_RANGES : WIDGET_RANGES;
}

/** Most Trade Hubs one Market Trend widget compares. */
export const MAX_TREND_HUBS = 3;

/** The most PLEX per 30 days a plan can be set to. */
export const MAX_PLEX_PLAN = 5000;

/** Kinds a new widget opens reading every Character; each must sum across them (`scope: 'account'` in its `KindDef`). */
export const OPENS_ON_ALL: ReadonlySet<string> = new Set(['omega']);

/** Soft limit on how many widgets one Overview holds. */
export const MAX_WIDGETS = 30;

export interface Widget {
  id: string;
  kind: WidgetKindId;
  size: WidgetSize;
  view: WidgetView;
  title?: string;
  scope: WidgetScope;
  range?: WidgetRange;
  /** Rows per page for a paged table; absent means the default. Only a table that opts in reads it. */
  rowsPerPage?: RowsPerPage;
  /** The pilot's Omega plan: PLEX per 30 days. Absent means the default (500). Only a kind with a plan reads it. */
  plexPer30Days?: number;
  /** Coming up only: which events it lists. Absent means accepted and tentative; stored only for 'all'. */
  calendarEvents?: CalendarEventsChoice;
  /** Skyhook raids only: 'near' lists any holder's space near the pilot. Absent means My alliance; stored only for 'near'. */
  raidsWhere?: 'near';
  /** Skyhook raids only: jumps for Near me. Absent means the default (8). */
  raidsRadius?: number;
  /** Market Trend only: the items it draws, newest pick last. Absent means the Quickbar's first items. */
  trendItems?: number[];
  /** Market Trend only: the Trade Hubs it prices at. Absent means the pilot's Market hub. */
  trendHubs?: string[];
  showOnPhone: boolean;
}

export interface OverviewLayout {
  version: 1;
  widgets: Widget[];
}

export type MakeId = () => string;
export type MoveTarget = 'up' | 'down' | 'top' | 'bottom' | number;

/** What a user action hands the Undo toast: its label key and where to go back to. */
export interface UndoableResult {
  layout: OverviewLayout;
  undoLabel: string;
  undoTo: OverviewLayout;
}

export function canAdd(layout: OverviewLayout, kind?: WidgetKindId): boolean {
  if (layout.widgets.length >= MAX_WIDGETS) return false;
  return kind === undefined || isAddable(kind);
}

function uniqueId(layout: OverviewLayout, makeId: MakeId): string {
  const taken = new Set(layout.widgets.map((w) => w.id));
  let id = makeId();
  // A bounded retry: a makeId that keeps colliding is a caller bug, not a loop.
  for (let i = 0; i < 1000 && taken.has(id); i++) id = makeId();
  return id;
}

/** A widget with its kind's defaults; null for a kind this build does not know. */
export function newWidget(kind: WidgetKindId, id: string): Widget | null {
  const def = getKind(kind);
  if (!def) return null;
  const widget: Widget = {
    id,
    kind,
    size: def.defaultSize,
    view: def.defaultView,
    scope: OPENS_ON_ALL.has(kind) ? 'all' : 'header',
    showOnPhone: true,
  };
  if (def.hasRange) widget.range = DEFAULT_RANGE;
  return widget;
}

/** What the Gallery's presets set on the widget they add; the rest stays the kind's default. */
export interface WidgetInit {
  title?: string;
  trendItems?: readonly number[];
  trendHubs?: readonly string[];
  view?: WidgetView;
}

export function addWidget(
  layout: OverviewLayout,
  kind: WidgetKindId,
  makeId: MakeId,
  init?: WidgetInit
): OverviewLayout {
  if (!canAdd(layout, kind)) return layout;
  const base = newWidget(kind, uniqueId(layout, makeId));
  if (!base) return layout;
  const widget: Widget = { ...base };
  if (init?.title) widget.title = init.title;
  if (init?.view && getKind(kind)?.views.includes(init.view)) widget.view = init.view;
  if (init?.trendItems?.length && getKind(kind)?.hasTrendSources) {
    widget.trendItems = [...init.trendItems];
  }
  if (init?.trendHubs?.length && getKind(kind)?.hasTrendSources) {
    const hubs = cleanTrendHubs(init.trendHubs);
    if (hubs.length) widget.trendHubs = hubs;
  }
  return { ...layout, widgets: [...layout.widgets, widget] };
}

export function removeWidget(layout: OverviewLayout, id: string): OverviewLayout {
  if (!layout.widgets.some((w) => w.id === id)) return layout;
  return { ...layout, widgets: layout.widgets.filter((w) => w.id !== id) };
}

export function moveWidget(layout: OverviewLayout, id: string, to: MoveTarget): OverviewLayout {
  const from = layout.widgets.findIndex((w) => w.id === id);
  if (from < 0) return layout;
  const last = layout.widgets.length - 1;
  const raw =
    to === 'up'
      ? from - 1
      : to === 'down'
        ? from + 1
        : to === 'top'
          ? 0
          : to === 'bottom'
            ? last
            : to;
  const target = Math.min(last, Math.max(0, raw));
  if (target === from) return layout;
  const widgets = [...layout.widgets];
  const [moved] = widgets.splice(from, 1);
  widgets.splice(target, 0, moved);
  return { ...layout, widgets };
}

/** Replace one widget with `patch(widget)`; the same layout back if `patch` returns null. */
function update(
  layout: OverviewLayout,
  id: string,
  patch: (w: Widget) => Widget | null
): OverviewLayout {
  const i = layout.widgets.findIndex((w) => w.id === id);
  if (i < 0) return layout;
  const next = patch(layout.widgets[i]);
  if (!next) return layout;
  const widgets = [...layout.widgets];
  widgets[i] = next;
  return { ...layout, widgets };
}

export function resizeWidget(layout: OverviewLayout, id: string, size: WidgetSize): OverviewLayout {
  return update(layout, id, (w) => (w.size === size ? null : { ...w, size }));
}

export function setView(layout: OverviewLayout, id: string, view: WidgetView): OverviewLayout {
  return update(layout, id, (w) => {
    if (w.view === view || !getKind(w.kind)?.views.includes(view)) return null;
    return { ...w, view };
  });
}

export function setScope(layout: OverviewLayout, id: string, scope: WidgetScope): OverviewLayout {
  return update(layout, id, (w) => (w.scope === scope ? null : { ...w, scope }));
}

export function setRange(layout: OverviewLayout, id: string, range: WidgetRange): OverviewLayout {
  return update(layout, id, (w) => {
    if (w.range === range || !rangesOf(w.kind).includes(range)) return null;
    return { ...w, range };
  });
}

/** Stored only when it differs from the default, so a widget nobody touched stays as small as before. */
export function setRowsPerPage(
  layout: OverviewLayout,
  id: string,
  rows: RowsPerPage
): OverviewLayout {
  if (!isRowsPerPage(rows)) return layout;
  return update(layout, id, (w) => {
    if (rows === (w.rowsPerPage ?? DEFAULT_ROWS_PER_PAGE)) return null;
    if (rows === DEFAULT_ROWS_PER_PAGE) {
      const { rowsPerPage: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, rowsPerPage: rows };
  });
}

export function isPlexPlan(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PLEX_PLAN
  );
}

/** Stored only when it differs from the default, so a widget nobody touched stays as small as before. */
export function setPlexPer30Days(layout: OverviewLayout, id: string, plex: number): OverviewLayout {
  if (!isPlexPlan(plex)) return layout;
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasPlexPlan || plex === (w.plexPer30Days ?? DEFAULT_PLEX_PER_30_DAYS)) {
      return null;
    }
    if (plex === DEFAULT_PLEX_PER_30_DAYS) {
      const { plexPer30Days: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, plexPer30Days: plex };
  });
}

/** Stored only when it differs from the default, so a widget nobody touched stays as small as before. */
export function setCalendarEvents(
  layout: OverviewLayout,
  id: string,
  choice: CalendarEventsChoice
): OverviewLayout {
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasCalendarEvents || choice === (w.calendarEvents ?? 'committed')) {
      return null;
    }
    if (choice === 'committed') {
      const { calendarEvents: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, calendarEvents: choice };
  });
}

/** Stored only when it differs from the default, so a widget nobody touched stays as small as before. */
export function setRaidsWhere(
  layout: OverviewLayout,
  id: string,
  where: RaidsWhere
): OverviewLayout {
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasRaidsWhere || where === (w.raidsWhere ?? 'alliance')) return null;
    if (where === 'alliance') {
      const { raidsWhere: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, raidsWhere: 'near' };
  });
}

/** Stored only when it differs from the default. */
export function setRaidsRadius(layout: OverviewLayout, id: string, radius: number): OverviewLayout {
  if (!isRaidsRadius(radius)) return layout;
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasRaidsWhere || radius === (w.raidsRadius ?? DEFAULT_RAIDS_RADIUS)) {
      return null;
    }
    if (radius === DEFAULT_RAIDS_RADIUS) {
      const { raidsRadius: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, raidsRadius: radius };
  });
}

/** An empty (or blank) name clears the title, so the kind's own title shows again. */
export function renameWidget(layout: OverviewLayout, id: string, title: string): OverviewLayout {
  const name = title.trim();
  return update(layout, id, (w) => {
    if (name === (w.title ?? '')) return null;
    if (name) return { ...w, title: name };
    const { title: _dropped, ...rest } = w;
    void _dropped;
    return rest;
  });
}

export function setShowOnPhone(layout: OverviewLayout, id: string, show: boolean): OverviewLayout {
  return update(layout, id, (w) => (w.showOnPhone === show ? null : { ...w, showOnPhone: show }));
}

export function duplicateWidget(
  layout: OverviewLayout,
  id: string,
  makeId: MakeId
): OverviewLayout {
  const i = layout.widgets.findIndex((w) => w.id === id);
  if (i < 0 || !canAdd(layout)) return layout;
  const { title: _dropped, ...source } = layout.widgets[i];
  void _dropped;
  const copy: Widget = { ...source, id: uniqueId(layout, makeId) };
  const widgets = [...layout.widgets];
  widgets.splice(i + 1, 0, copy);
  return { ...layout, widgets };
}

export function snapshotLayout(layout: OverviewLayout): OverviewLayout {
  return structuredClone(layout);
}

/** Cancel: a fresh copy of the snapshot, so editing it later cannot touch the snapshot. */
export function restoreLayout(snapshot: OverviewLayout): OverviewLayout {
  return structuredClone(snapshot);
}

export function resetLayout(defaultLayout: OverviewLayout): OverviewLayout {
  return structuredClone(defaultLayout);
}

/** Pair a change with its Undo: null when nothing changed, so no toast is raised. */
function undoable(
  before: OverviewLayout,
  after: OverviewLayout,
  undoLabel: string
): UndoableResult | null {
  if (after === before) return null;
  return { layout: after, undoLabel, undoTo: snapshotLayout(before) };
}

const UNDO_LABELS = {
  added: 'overview.customize.undo.added',
  removed: 'overview.customize.undo.removed',
  resized: 'overview.customize.undo.resized',
  duplicated: 'overview.customize.undo.duplicated',
  reset: 'overview.customize.undo.reset',
} as const;

export function addWidgetUndoable(
  layout: OverviewLayout,
  kind: WidgetKindId,
  makeId: MakeId,
  init?: WidgetInit
): UndoableResult | null {
  return undoable(layout, addWidget(layout, kind, makeId, init), UNDO_LABELS.added);
}

export function removeWidgetUndoable(layout: OverviewLayout, id: string): UndoableResult | null {
  return undoable(layout, removeWidget(layout, id), UNDO_LABELS.removed);
}

export function resizeWidgetUndoable(
  layout: OverviewLayout,
  id: string,
  size: WidgetSize
): UndoableResult | null {
  return undoable(layout, resizeWidget(layout, id, size), UNDO_LABELS.resized);
}

export function duplicateWidgetUndoable(
  layout: OverviewLayout,
  id: string,
  makeId: MakeId
): UndoableResult | null {
  return undoable(layout, duplicateWidget(layout, id, makeId), UNDO_LABELS.duplicated);
}

export function resetLayoutUndoable(
  layout: OverviewLayout,
  defaultLayout: OverviewLayout
): UndoableResult | null {
  return {
    layout: resetLayout(defaultLayout),
    undoLabel: UNDO_LABELS.reset,
    undoTo: snapshotLayout(layout),
  };
}

/**
 * Move a widget one place earlier or later among the widgets the page draws.
 * The grid hides kinds a newer build wrote and (on a phone) widgets set to Hide
 * on phone; stepping by one index in the full list would land beside one of
 * those and look like a no-op, so this hops to the drawn neighbour's place.
 */
export function stepWidget(
  layout: OverviewLayout,
  id: string,
  direction: 'earlier' | 'later',
  isDrawn: (widget: Widget) => boolean
): OverviewLayout {
  const from = layout.widgets.findIndex((w) => w.id === id);
  if (from < 0) return layout;
  const step = direction === 'earlier' ? -1 : 1;
  for (let i = from + step; i >= 0 && i < layout.widgets.length; i += step) {
    if (isDrawn(layout.widgets[i])) return moveWidget(layout, id, i);
  }
  return layout;
}

/** A drop: put `id` where `overId` sits, both named by id so the drawn subset never matters. */
export function moveToWidget(layout: OverviewLayout, id: string, overId: string): OverviewLayout {
  const to = layout.widgets.findIndex((w) => w.id === overId);
  if (to < 0 || id === overId) return layout;
  return moveWidget(layout, id, to);
}

/** Whole positive type ids, each once, at most the most lines a widget draws; the rest is dropped. */
export function cleanTrendItems(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((v): v is number => Number.isInteger(v) && v > 0);
  return [...new Set(ids)].slice(0, TREND_MAX_SERIES);
}

/** Known Trade Hub ids, each once, at most `MAX_TREND_HUBS`. */
export function cleanTrendHubs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((v): v is string => typeof v === 'string' && getTradeHub(v) !== undefined);
  return [...new Set(ids)].slice(0, MAX_TREND_HUBS);
}

const sameList = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
  (a ?? []).length === b.length && b.every((v, i) => a![i] === v);

/** An empty list clears the setting, so the widget follows the Quickbar again. */
export function setTrendItems(layout: OverviewLayout, id: string, items: unknown): OverviewLayout {
  const next = cleanTrendItems(items);
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasTrendSources || sameList(w.trendItems, next)) return null;
    if (next.length === 0) {
      const { trendItems: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, trendItems: next };
  });
}

/** An empty list clears the setting, so the widget prices at the pilot's Market hub again. */
export function setTrendHubs(layout: OverviewLayout, id: string, hubs: unknown): OverviewLayout {
  const next = cleanTrendHubs(hubs);
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasTrendSources || sameList(w.trendHubs, next)) return null;
    if (next.length === 0) {
      const { trendHubs: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, trendHubs: next };
  });
}
