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
import { getKind, isAddable, type WidgetKindId, type WidgetSize, type WidgetView } from './kinds';

export type { WidgetKindId, WidgetSize, WidgetView };

export type WidgetScope = 'header' | 'all';
export type WidgetRange = 7 | 30 | 90;
export const WIDGET_RANGES: readonly WidgetRange[] = [7, 30, 90];
export const DEFAULT_RANGE: WidgetRange = 30;

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
    scope: 'header',
    showOnPhone: true,
  };
  if (def.hasRange) widget.range = DEFAULT_RANGE;
  return widget;
}

export function addWidget(
  layout: OverviewLayout,
  kind: WidgetKindId,
  makeId: MakeId
): OverviewLayout {
  if (!canAdd(layout, kind)) return layout;
  const widget = newWidget(kind, uniqueId(layout, makeId));
  if (!widget) return layout;
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
    if (w.range === range || !getKind(w.kind)?.hasRange) return null;
    return { ...w, range };
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

export const UNDO_LABELS = {
  added: 'overview.customize.undo.added',
  removed: 'overview.customize.undo.removed',
  resized: 'overview.customize.undo.resized',
  duplicated: 'overview.customize.undo.duplicated',
  reset: 'overview.customize.undo.reset',
} as const;

export function addWidgetUndoable(
  layout: OverviewLayout,
  kind: WidgetKindId,
  makeId: MakeId
): UndoableResult | null {
  return undoable(layout, addWidget(layout, kind, makeId), UNDO_LABELS.added);
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
