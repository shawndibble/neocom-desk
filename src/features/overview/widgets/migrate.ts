import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { isAddable, type WidgetKindId, type WidgetShow } from './kinds';
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

export function parseHiddenCards(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((key): key is string => typeof key === 'string'))];
}

export const useOverviewHiddenCards = createSyncedSetting<string[]>({
  key: OVERVIEW_HIDDEN_CARDS_KEY,
  defaultValue: [],
  parse: parseHiddenCards,
});

export const useOverviewCardOrder = createSyncedSetting<string[]>({
  key: OVERVIEW_CARD_ORDER_KEY,
  defaultValue: [],
  parse: parseHiddenCards,
});

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

const ALIASES: Record<string, string> = { miningTax: 'mining' };

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

export function isReturningPilot(hidden: readonly string[], order: readonly string[]): boolean {
  return hidden.length > 0 || order.length > 0;
}

const SHOW_FOLDS: Readonly<Record<string, { kind: WidgetKindId; show: WidgetShow }>> = {
  corpServices: { kind: 'structures', show: 'problems' },
  walletFlow: { kind: 'wallet', show: 'flow' },
  corpCashFlow: { kind: 'corpWallet', show: 'flow' },
  corpIncome: { kind: 'corpWallet', show: 'sources' },
};

export function migrateRetiredKind(raw: Record<string, unknown>): Record<string, unknown> {
  const folded = typeof raw.kind === 'string' ? SHOW_FOLDS[raw.kind] : undefined;
  if (folded) return { ...raw, kind: folded.kind, show: folded.show };
  if (raw.kind === 'structures' && raw.structuresShow !== undefined) {
    const { structuresShow, ...rest } = raw;
    return structuresShow === 'problems' ? { ...rest, show: 'problems' } : rest;
  }
  if (raw.kind === 'tradingProfit') return { ...raw, kind: 'profit', profitSource: 'trading' };
  if (raw.kind === 'profit' && !isProfitSource(raw.profitSource)) {
    return { ...raw, profitSource: LEGACY_PROFIT_SOURCE };
  }
  return raw;
}
