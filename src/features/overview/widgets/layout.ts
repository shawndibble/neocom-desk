import { DEFAULT_PLEX_PER_30_DAYS } from '@/engine/omegaCoverage';
import { TREND_MAX_SERIES } from '@/engine/market/trendSeries';
import { getTradeHub } from '@/market/hubs';
import { isRowsPerPage, DEFAULT_ROWS_PER_PAGE, type RowsPerPage } from './tableSortPage';
import {
  getKind,
  isAddable,
  storedShow,
  type WidgetKindId,
  type WidgetShow,
  type WidgetSize,
  type WidgetView,
} from './kinds';

export type { WidgetKindId, WidgetShow, WidgetSize, WidgetView };

import { LAYER_IDS, type LayerId } from '@/engine/netWorth/series';
import type { EmpireFaction } from '@/engine/empireFactions';
import { CHARACTER_BOARD_ITEM_KINDS, type CharacterBoardItemKind } from '@/engine/character/board';

export type CorpScope = `corp:${number}`;
export type WidgetScope = 'header' | 'all' | CorpScope;

export const corpScope = (corporationId: number): CorpScope => `corp:${corporationId}`;

export function scopeCorporation(scope: WidgetScope): number | null {
  return scope.startsWith('corp:') ? Number(scope.slice(5)) : null;
}

export function isWidgetScope(value: unknown): value is WidgetScope {
  return (
    value === 'header' ||
    value === 'all' ||
    (typeof value === 'string' && /^corp:[1-9]\d*$/.test(value))
  );
}
export type CalendarEventsChoice = 'committed' | 'all';
export const CALENDAR_EVENTS_CHOICES: readonly CalendarEventsChoice[] = ['committed', 'all'];

export type RaidsWhere = 'alliance' | 'near';
export const RAIDS_WHERES: readonly RaidsWhere[] = ['alliance', 'near'];
export const RAIDS_RADII: readonly number[] = [5, 8, 10, 15];
export const DEFAULT_RAIDS_RADIUS = 8;
export const isRaidsRadius = (value: unknown): value is number =>
  typeof value === 'number' && RAIDS_RADII.includes(value);

export type ProfitSource = 'builds' | 'trading' | 'both';
export const PROFIT_SOURCES: readonly ProfitSource[] = ['builds', 'trading', 'both'];
export const DEFAULT_PROFIT_SOURCE: ProfitSource = 'both';
export const LEGACY_PROFIT_SOURCE: ProfitSource = 'builds';
export const isProfitSource = (value: unknown): value is ProfitSource =>
  PROFIT_SOURCES.includes(value as ProfitSource);

export type CampaignFaction = 'all' | EmpireFaction;
export const CAMPAIGN_FACTIONS: readonly CampaignFaction[] = [
  'all',
  'amarr',
  'caldari',
  'gallente',
  'minmatar',
];
export const isCampaignFaction = (value: unknown): value is CampaignFaction =>
  CAMPAIGN_FACTIONS.includes(value as CampaignFaction);

export type WidgetRange = 7 | 30 | 90 | 365;
export const WIDGET_RANGES: readonly WidgetRange[] = [7, 30, 90];
export const LONG_WIDGET_RANGES: readonly WidgetRange[] = [7, 30, 90, 365];
export const DEFAULT_RANGE: WidgetRange = 30;

export function rangesOf(kind: WidgetKindId): readonly WidgetRange[] {
  const def = getKind(kind);
  if (!def?.hasRange) return [];
  return def.hasLongRange ? LONG_WIDGET_RANGES : WIDGET_RANGES;
}

export const MAX_TREND_HUBS = 3;

export const MAX_PLEX_PLAN = 5000;

export const OPENS_ON_ALL: ReadonlySet<string> = new Set(['omega']);

export const MAX_WIDGETS = 30;

export interface Widget {
  id: string;
  kind: WidgetKindId;
  size: WidgetSize;
  view: WidgetView;
  title?: string;
  scope: WidgetScope;
  range?: WidgetRange;
  rowsPerPage?: RowsPerPage;
  plexPer30Days?: number;
  calendarEvents?: CalendarEventsChoice;
  hiddenKinds?: CharacterBoardItemKind[];
  raidsWhere?: 'near';
  raidsRadius?: number;
  hiddenLayers?: LayerId[];
  profitSource?: ProfitSource;
  campaignFaction?: Exclude<CampaignFaction, 'all'>;
  trendItems?: number[];
  trendHubs?: string[];
  show?: WidgetShow;
  showOnPhone: boolean;
}

export interface OverviewLayout {
  version: 1;
  widgets: Widget[];
}

export type MakeId = () => string;
export type MoveTarget = 'up' | 'down' | 'top' | 'bottom' | number;

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
  for (let i = 0; i < 1000 && taken.has(id); i++) id = makeId();
  return id;
}

export function newWidget(kind: WidgetKindId, id: string, show?: WidgetShow): Widget | null {
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
  if (def.hasProfitSource) widget.profitSource = DEFAULT_PROFIT_SOURCE;
  const stored = storedShow(def, show);
  if (stored) widget.show = stored;
  return widget;
}

export interface WidgetInit {
  title?: string;
  trendItems?: readonly number[];
  trendHubs?: readonly string[];
  view?: WidgetView;
  size?: WidgetSize;
  show?: WidgetShow;
  scope?: WidgetScope;
}

function withInit(kind: WidgetKindId, id: string, init?: WidgetInit): Widget | null {
  const def = getKind(kind);
  const base = newWidget(kind, id, init?.show);
  if (!def || !base) return null;
  const widget: Widget = { ...base };
  if (init?.title) widget.title = init.title;
  if (init?.view && def.views.includes(init.view)) widget.view = init.view;
  if (init?.size) widget.size = init.size;
  if (init?.scope) widget.scope = init.scope;
  if (init?.trendItems?.length && def.hasTrendSources) {
    widget.trendItems = [...init.trendItems];
  }
  if (init?.trendHubs?.length && def.hasTrendSources) {
    const hubs = cleanTrendHubs(init.trendHubs);
    if (hubs.length) widget.trendHubs = hubs;
  }
  return widget;
}

export type WidgetSeed = WidgetKindId | ({ kind: WidgetKindId } & WidgetInit);

export const seedKind = (seed: WidgetSeed): WidgetKindId =>
  typeof seed === 'string' ? seed : seed.kind;

export function seedWidget(seed: WidgetSeed, id: string): Widget | null {
  return typeof seed === 'string' ? newWidget(seed, id) : withInit(seed.kind, id, seed);
}

export function addWidget(
  layout: OverviewLayout,
  kind: WidgetKindId,
  makeId: MakeId,
  init?: WidgetInit
): OverviewLayout {
  if (!canAdd(layout, kind)) return layout;
  const widget = withInit(kind, uniqueId(layout, makeId), init);
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

export function setAllScopes(
  layout: OverviewLayout,
  scope: WidgetScope,
  canTake: (widget: Widget) => boolean = () => true
): OverviewLayout {
  const widgets = layout.widgets.map((w) =>
    w.scope === scope || !canTake(w) ? w : { ...w, scope }
  );
  return widgets.every((w, i) => w === layout.widgets[i]) ? layout : { ...layout, widgets };
}

export function setRange(layout: OverviewLayout, id: string, range: WidgetRange): OverviewLayout {
  return update(layout, id, (w) => {
    if (w.range === range || !rangesOf(w.kind).includes(range)) return null;
    return { ...w, range };
  });
}

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

export function setShow(layout: OverviewLayout, id: string, show: WidgetShow): OverviewLayout {
  return update(layout, id, (w) => {
    const def = getKind(w.kind);
    if (!def?.shows.includes(show)) return null;
    const next = storedShow(def, show);
    if (next === storedShow(def, w.show)) return null;
    if (!next) {
      const { show: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, show: next };
  });
}

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

export function setProfitSource(
  layout: OverviewLayout,
  id: string,
  source: ProfitSource
): OverviewLayout {
  if (!isProfitSource(source)) return layout;
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasProfitSource || source === (w.profitSource ?? LEGACY_PROFIT_SOURCE)) {
      return null;
    }
    return { ...w, profitSource: source };
  });
}

export function setCampaignFaction(
  layout: OverviewLayout,
  id: string,
  faction: CampaignFaction
): OverviewLayout {
  if (!isCampaignFaction(faction)) return layout;
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasCampaignFaction || faction === (w.campaignFaction ?? 'all')) {
      return null;
    }
    if (faction === 'all') {
      const { campaignFaction: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, campaignFaction: faction };
  });
}

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

export function restoreLayout(snapshot: OverviewLayout): OverviewLayout {
  return structuredClone(snapshot);
}

export function resetLayout(defaultLayout: OverviewLayout): OverviewLayout {
  return structuredClone(defaultLayout);
}

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
  scoped: 'overview.customize.undo.scoped',
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

export function setAllScopesUndoable(
  layout: OverviewLayout,
  scope: WidgetScope,
  canTake?: (widget: Widget) => boolean
): UndoableResult | null {
  return undoable(layout, setAllScopes(layout, scope, canTake), UNDO_LABELS.scoped);
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

export function moveToWidget(layout: OverviewLayout, id: string, overId: string): OverviewLayout {
  const to = layout.widgets.findIndex((w) => w.id === overId);
  if (to < 0 || id === overId) return layout;
  return moveWidget(layout, id, to);
}

export function cleanTrendItems(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((v): v is number => Number.isInteger(v) && v > 0);
  return [...new Set(ids)].slice(0, TREND_MAX_SERIES);
}

export function cleanTrendHubs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((v): v is string => typeof v === 'string' && getTradeHub(v) !== undefined);
  return [...new Set(ids)].slice(0, MAX_TREND_HUBS);
}

export function cleanHiddenLayers(raw: unknown): LayerId[] {
  if (!Array.isArray(raw)) return [];
  const hidden = LAYER_IDS.filter((id) => raw.includes(id));
  return hidden.length >= LAYER_IDS.length ? [] : hidden;
}

export function cleanHiddenKinds(raw: unknown): CharacterBoardItemKind[] {
  if (!Array.isArray(raw)) return [];
  return CHARACTER_BOARD_ITEM_KINDS.filter((kind) => raw.includes(kind));
}

const sameList = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
  (a ?? []).length === b.length && b.every((v, i) => a![i] === v);

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

export function setHiddenKinds(layout: OverviewLayout, id: string, kinds: unknown): OverviewLayout {
  const next = cleanHiddenKinds(kinds);
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasCalendarEvents || sameList(w.hiddenKinds, next)) return null;
    if (next.length === 0) {
      const { hiddenKinds: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, hiddenKinds: next };
  });
}

export function setHiddenLayers(
  layout: OverviewLayout,
  id: string,
  layers: unknown
): OverviewLayout {
  const next = cleanHiddenLayers(layers);
  return update(layout, id, (w) => {
    if (!getKind(w.kind)?.hasLayerPicker || sameList(w.hiddenLayers, next)) return null;
    if (next.length === 0) {
      const { hiddenLayers: _dropped, ...rest } = w;
      void _dropped;
      return rest;
    }
    return { ...w, hiddenLayers: next };
  });
}
