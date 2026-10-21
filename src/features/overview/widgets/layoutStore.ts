/**
 * The pilot's Overview Layout, persisted and synced like the old hidden-card
 * setting: one value for the whole account, last-write-wins as a whole.
 *
 * `defaultValue` is `null` on purpose: first run is detected by absence, once
 * the store has hydrated (read `hydrated` before showing the Role chooser).
 *
 * `parse` runs on every value read back, including one another device wrote,
 * possibly from a newer build. So it KEEPS widgets of kinds it does not know,
 * and any extra fields, untouched: dropping them would rewrite the layout on
 * the next edit and delete a newer build's widgets on every device. It only
 * repairs what it can judge, i.e. fields of kinds it does know. It does not
 * cap the count either: the 30-widget limit belongs to the add/duplicate
 * reducers and the Gallery, and truncating here would drop another device's
 * widgets on the next write.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { getKind } from './kinds';
import {
  DEFAULT_RANGE,
  isPlexPlan,
  WIDGET_RANGES,
  type OverviewLayout,
  type Widget,
  type WidgetRange,
} from './layout';
import { SIZES } from './sizes';
import { isRowsPerPage } from './tableSortPage';

export const OVERVIEW_LAYOUT_KEY = 'sync.overviewLayout';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseWidget(raw: unknown): Widget | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.kind !== 'string') return null;
  const def = getKind(raw.kind);
  // A kind from a newer build: keep it exactly as found.
  if (!def) return raw as unknown as Widget;

  const out: Record<string, unknown> = { ...raw };
  if (!SIZES.includes(raw.size as never)) out.size = def.defaultSize;
  // The List view became Table: a layout saved before the rename keeps its choice.
  if (raw.view === 'list') out.view = 'table';
  if (!def.views.includes(out.view as never)) out.view = def.defaultView;
  if (raw.scope !== 'header' && raw.scope !== 'all') out.scope = 'header';
  if (typeof raw.showOnPhone !== 'boolean') out.showOnPhone = true;
  if (typeof raw.title !== 'string') delete out.title;
  if (WIDGET_RANGES.includes(raw.range as WidgetRange)) {
    // valid; kept
  } else if (def.hasRange) {
    out.range = DEFAULT_RANGE;
  } else {
    delete out.range;
  }
  if (!isRowsPerPage(raw.rowsPerPage)) delete out.rowsPerPage;
  if (!def.hasCalendarEvents || raw.calendarEvents !== 'all') delete out.calendarEvents;
  if (!def.hasPlexPlan || !isPlexPlan(raw.plexPer30Days)) delete out.plexPer30Days;
  return out as unknown as Widget;
}

export function parseLayout(raw: unknown): OverviewLayout | null {
  if (!isRecord(raw) || !Array.isArray(raw.widgets)) return null;
  const seen = new Set<string>();
  const widgets: Widget[] = [];
  for (const entry of raw.widgets) {
    const widget = parseWidget(entry);
    if (!widget || seen.has(widget.id)) continue;
    seen.add(widget.id);
    widgets.push(widget);
  }
  return {
    ...raw,
    version: typeof raw.version === 'number' ? raw.version : 1,
    widgets,
  } as OverviewLayout;
}

export const useOverviewLayout = createSyncedSetting<OverviewLayout | null>({
  key: OVERVIEW_LAYOUT_KEY,
  defaultValue: null,
  parse: parseLayout,
});

/**
 * The Corp Board's layout: same shape and parse. `null` means the pilot has
 * never edited it, and the page draws the full default without saving it
 * (`features/corp/grid/corpGrid.ts`).
 */
export const CORP_OVERVIEW_LAYOUT_KEY = 'sync.corpOverviewLayout';

export const useCorpOverviewLayout = createSyncedSetting<OverviewLayout | null>({
  key: CORP_OVERVIEW_LAYOUT_KEY,
  defaultValue: null,
  parse: parseLayout,
});
