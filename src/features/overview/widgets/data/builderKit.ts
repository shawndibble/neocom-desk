import type { DeadlineSeverity } from '@/engine/character/severity';
import { formatAge } from '@/lib/age';
import type { WidgetStateInput } from '../state';
import type { WidgetShow } from '../kinds';
import type { EsiEndpointId } from '@/esi/registry';
import type { SettingsContext } from './viewSettings';
import type {
  BuildContext,
  DetailTone,
  FeedId,
  FeedState,
  Feeds,
  KindView,
  NumberModel,
} from './types';
import type { Translate } from '@/lib/translate';
import { corpCell } from './cellKit';
import type { CorpFeedBase } from './corpFeeds';

export const STOCK_PATH = '/market/stock';

export const UNKNOWN = '—';

export function statusOf(
  feed: FeedState<unknown> | undefined,
  over: {
    needsPermission?: boolean;
    isEmpty?: boolean;
    hasData?: boolean;
    loading?: boolean;
    hasStaleData?: boolean;
  } = {}
): WidgetStateInput {
  return {
    hasStaleData: over.hasStaleData ?? false,
    loading: over.loading ?? feed?.loading ?? true,
    needsPermission: over.needsPermission ?? false,
    error: feed?.error ?? false,
    hasData: over.hasData ?? (feed?.data !== null && feed?.data !== undefined),
    isEmpty: over.isEmpty ?? false,
  };
}

export const failedBuilders = new Set<string>();

export const NEUTRAL_NUMBER: NumberModel = { value: UNKNOWN, tone: 'clear' };

export function blank(to: string | null, status: WidgetStateInput): KindView {
  return {
    status,
    fetchedAt: null,
    fromCache: false,
    number: NEUTRAL_NUMBER,
    rows: [],
    deadlines: [],
    summary: '',
    to,
    emptyMessage: undefined,
  };
}

export function corpUnreadable(
  to: string | null,
  feed: FeedState<unknown> | undefined,
  needsReauth: boolean,
  t: Translate
): KindView {
  return {
    ...blank(to, statusOf(feed, { needsPermission: needsReauth, isEmpty: !needsReauth })),
    emptyMessage: t('overview.board.corpUnreadable'),
  };
}

export function ageText(t: Translate, nowMs: number, atMs: number | null): string {
  return atMs === null ? UNKNOWN : formatAge(Math.max(0, nowMs - atMs), t);
}

export const count = (n: number): string => String(n);

export type Builder = (feeds: Feeds, ctx: BuildContext) => KindView;

export function byShow(
  builders: Readonly<Partial<Record<WidgetShow, Builder>>>,
  fallback: Builder
): Builder {
  return (feeds, ctx) => ((ctx.show && builders[ctx.show]) || fallback)(feeds, ctx);
}

export type KindScope = 'character' | 'account';

export interface SettingsReads {
  feeds: readonly FeedId[];
  allFeeds?: readonly FeedId[];
  scope: KindScope;
  endpoints: readonly EsiEndpointId[];
}

export interface KindDef {
  feeds: readonly FeedId[];
  scope: KindScope;
  allFeeds?: readonly FeedId[];
  build: Builder;
  loadBuild?: () => Promise<Builder>;
  bySettings?: (settings: SettingsContext) => SettingsReads;
}

export function detailToneOf(severity: DeadlineSeverity): DetailTone {
  if (severity === 'critical') return 'danger';
  return severity === 'warning' || severity === 'watch' ? 'warning' : 'neutral';
}

export function acrossCorporations(view: KindView, data: CorpFeedBase, t: Translate): KindView {
  const missing = t('overview.board.corporationsMissing');
  const flagged: KindView = data.partlyFailed
    ? {
        ...view,
        number: { ...view.number, notes: [...(view.number.notes ?? []), missing] },
        ...(view.table && { table: { ...view.table, footer: missing } }),
      }
    : view;
  const labels = data.corporations;
  const corporationOf = data.corporationOf;
  if (!labels || labels.size < 2 || !corporationOf) return flagged;
  const corpOf = (key: string) => {
    const id = corporationOf.get(key);
    return id === undefined ? undefined : labels.get(id);
  };
  const label = t('overview.board.corporation');
  const { table } = flagged;
  return {
    ...flagged,
    rows: flagged.rows.map((row) => {
      const corp = corpOf(row.key);
      if (!corp) return row;
      return { ...row, detail: row.detail ? `${row.detail} · ${corp.ticker}` : corp.ticker };
    }),
    ...(table && {
      table: {
        ...table,
        columns: [
          ...table.columns.slice(0, 1),
          { key: 'corp', label, priority: 4, sortable: table.columns[0]?.sortable },
          ...table.columns.slice(1),
        ],
        rows: table.rows.map((row) => {
          const corp = corpOf(row.key);
          return {
            ...row,
            cells: [
              ...row.cells.slice(0, 1),
              corp ? corpCell(corp) : UNKNOWN,
              ...row.cells.slice(1),
            ],
            ...(row.sort && {
              sort: [...row.sort.slice(0, 1), corp?.ticker, ...row.sort.slice(1)],
            }),
            ...(row.detail &&
              corp && {
                detail: {
                  ...row.detail,
                  facts: [{ label, value: corp.name }, ...row.detail.facts],
                },
              }),
          };
        }),
      },
    }),
  };
}
