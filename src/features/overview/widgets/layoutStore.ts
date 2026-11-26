import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { getKind, storedShow } from './kinds';
import {
  cleanTrendHubs,
  cleanTrendItems,
  DEFAULT_RANGE,
  DEFAULT_RAIDS_RADIUS,
  isPlexPlan,
  isWidgetScope,
  isCampaignFaction,
  isRaidsRadius,
  rangesOf,
  type OverviewLayout,
  type Widget,
  type WidgetRange,
  cleanHiddenKinds,
  cleanHiddenLayers,
} from './layout';
import { migrateRetiredKind } from './migrate';
import { SIZES } from './sizes';
import { isRowsPerPage } from './tableSortPage';
import { isPlainRecord } from '@/engine/guards';

export const OVERVIEW_LAYOUT_KEY = 'sync.overviewLayout';

function parseWidget(stored: unknown): Widget | null {
  const raw = isPlainRecord(stored) ? migrateRetiredKind(stored) : stored;
  if (!isPlainRecord(raw) || typeof raw.id !== 'string' || typeof raw.kind !== 'string')
    return null;
  const def = getKind(raw.kind);
  if (!def) return raw as unknown as Widget;

  const out: Record<string, unknown> = { ...raw };
  if (!SIZES.includes(raw.size as never)) out.size = def.defaultSize;
  if (raw.view === 'list') out.view = 'table';
  if (!def.views.includes(out.view as never)) out.view = def.defaultView;
  if (!isWidgetScope(raw.scope)) out.scope = 'header';
  if (typeof raw.showOnPhone !== 'boolean') out.showOnPhone = true;
  if (typeof raw.title !== 'string') delete out.title;
  if (!rangesOf(def.id).includes(raw.range as WidgetRange)) {
    if (def.hasRange) out.range = DEFAULT_RANGE;
    else delete out.range;
  }
  if (!isRowsPerPage(raw.rowsPerPage)) delete out.rowsPerPage;
  if (!def.hasCalendarEvents || raw.calendarEvents !== 'all') delete out.calendarEvents;
  const hiddenKinds = cleanHiddenKinds(raw.hiddenKinds);
  if (!def.hasCalendarEvents || hiddenKinds.length === 0) delete out.hiddenKinds;
  else out.hiddenKinds = hiddenKinds;
  if (!def.hasRaidsWhere || raw.raidsWhere !== 'near') delete out.raidsWhere;
  if (
    !def.hasRaidsWhere ||
    !isRaidsRadius(raw.raidsRadius) ||
    raw.raidsRadius === DEFAULT_RAIDS_RADIUS
  ) {
    delete out.raidsRadius;
  }
  if (!def.hasPlexPlan || !isPlexPlan(raw.plexPer30Days)) delete out.plexPer30Days;
  if (!def.hasProfitSource) delete out.profitSource;
  if (
    !def.hasCampaignFaction ||
    !isCampaignFaction(raw.campaignFaction) ||
    raw.campaignFaction === 'all'
  ) {
    delete out.campaignFaction;
  }
  const hiddenLayers = cleanHiddenLayers(raw.hiddenLayers);
  if (!def.hasLayerPicker || hiddenLayers.length === 0) delete out.hiddenLayers;
  else out.hiddenLayers = hiddenLayers;
  const show = storedShow(def, raw.show);
  if (show) out.show = show;
  else delete out.show;
  const items = cleanTrendItems(raw.trendItems);
  if (!def.hasTrendSources || items.length === 0) delete out.trendItems;
  else out.trendItems = items;
  const hubs = cleanTrendHubs(raw.trendHubs);
  if (!def.hasTrendSources || hubs.length === 0) delete out.trendHubs;
  else out.trendHubs = hubs;
  return out as unknown as Widget;
}

export function parseLayout(raw: unknown): OverviewLayout | null {
  if (!isPlainRecord(raw) || !Array.isArray(raw.widgets)) return null;
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

export const CORP_OVERVIEW_LAYOUT_KEY = 'sync.corpOverviewLayout';

export const useCorpOverviewLayout = createSyncedSetting<OverviewLayout | null>({
  key: CORP_OVERVIEW_LAYOUT_KEY,
  defaultValue: null,
  parse: parseLayout,
});
