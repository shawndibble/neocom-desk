/**
 * Turns the old board's two settings (hidden cards, card order) into an
 * Overview Layout for a pilot who had them before the widget grid shipped.
 *
 * The two retired settings are read here and nowhere else: nothing writes them
 * any more. A non-empty list is also how the page knows the pilot is returning.
 *
 * Both keys stay on the synced-settings allow-list and `parseHiddenCards` keeps
 * keys this build has no meaning for: the value merges last-write-wins as a
 * whole, so a build that dropped a key it did not recognise would corrupt
 * another device's copy.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { isAddable, type WidgetKindId } from './kinds';
import {
  isProfitSource,
  LEGACY_PROFIT_SOURCE,
  newWidget,
  type MakeId,
  type OverviewLayout,
  type Widget,
} from './layout';

export const OVERVIEW_HIDDEN_CARDS_KEY = 'sync.overviewHiddenCards';
export const OVERVIEW_CARD_ORDER_KEY = 'sync.overviewCardOrder';

/** Any list of strings, deduped — including keys this build has no meaning for. */
export function parseHiddenCards(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((key): key is string => typeof key === 'string'))];
}

/** The old board's hidden-cards list (read side only). */
export const useOverviewHiddenCards = createSyncedSetting<string[]>({
  key: OVERVIEW_HIDDEN_CARDS_KEY,
  defaultValue: [],
  parse: parseHiddenCards,
});

/** The old board's card order, as the pilot dragged it (read side only). */
export const useOverviewCardOrder = createSyncedSetting<string[]>({
  key: OVERVIEW_CARD_ORDER_KEY,
  defaultValue: [],
  parse: parseHiddenCards,
});

/** Old card key -> Widget Kind, in the old board's built-in order. */
const CARD_TO_KIND: readonly [string, WidgetKindId][] = [
  ['orders', 'orders'],
  ['mining', 'miningTax'],
  ['contracts', 'contracts'],
  ['planetary', 'planetary'],
  ['industry', 'industry'],
  ['structures', 'structures'],
  ['moonChunks', 'moonChunks'],
  ['comingUp', 'comingUp'],
  ['spExtraction', 'sp'],
  ['mail', 'mail'],
  ['priceAlerts', 'priceWatch'],
  ['incursions', 'incursions'],
  ['stock', 'stock'],
];

/** The migration also accepts the Widget Kind's own name for the mining card. */
const ALIASES: Record<string, string> = { miningTax: 'mining' };

/** Cards that started switched off; their "on" is a `show:<key>` marker. */
const DEFAULT_OFF = new Set(['incursions']);

const BUILTIN_ORDER = CARD_TO_KIND.map(([key]) => key);
const KIND_OF = new Map(CARD_TO_KIND);

function seqId(): MakeId {
  let n = 0;
  return () => `m${++n}`;
}

export function migrateFromCards(
  old: { hidden: readonly string[]; order: readonly string[] },
  makeId: MakeId = seqId()
): OverviewLayout {
  const hidden = new Set(old.hidden);
  const stored = old.order.map((key) => ALIASES[key] ?? key).filter((key) => KIND_OF.has(key));
  const placed = new Set(stored);
  const ordered = [...new Set(stored), ...BUILTIN_ORDER.filter((key) => !placed.has(key))];

  const kinds: WidgetKindId[] = ['wallet', 'training'];
  for (const key of ordered) {
    const shown = DEFAULT_OFF.has(key) ? hidden.has(`show:${key}`) : !hidden.has(key);
    const kind = KIND_OF.get(key);
    if (shown && kind && isAddable(kind) && !kinds.includes(kind)) kinds.push(kind);
  }

  const widgets: Widget[] = [];
  for (const kind of kinds) {
    const w = newWidget(kind, makeId());
    if (w) widgets.push(w);
  }
  return { version: 1, widgets };
}

/** Whether the old settings show this pilot used the board before the grid. */
export function isReturningPilot(hidden: readonly string[], order: readonly string[]): boolean {
  return hidden.length > 0 || order.length > 0;
}

/**
 * A saved widget of a retired or reshaped kind, as this build reads it; any
 * other widget comes back as the very object passed. `parseLayout` runs it on
 * every read, so a layout another device wrote before the change still loads,
 * and the new form is only written on the pilot's next edit. Size, view,
 * scope, range, title and the rest stay as saved; `parseLayout` repairs
 * whatever the new kind does not offer.
 *
 * - Offline services folded into Structures' Problems only: the same feed, and
 *   the structures with an offline service are among the problems it lists.
 * - Trading profit became Profit on Trading; a Profit widget saved before the
 *   Source setting existed is put on Builds, which is all it ever showed
 *   (decision `20261024-191335`).
 */
export function migrateRetiredKind(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.kind === 'corpServices') {
    return { ...raw, kind: 'structures', structuresShow: 'problems' };
  }
  if (raw.kind === 'tradingProfit') return { ...raw, kind: 'profit', profitSource: 'trading' };
  if (raw.kind === 'profit' && !isProfitSource(raw.profitSource)) {
    return { ...raw, profitSource: LEGACY_PROFIT_SOURCE };
  }
  return raw;
}
