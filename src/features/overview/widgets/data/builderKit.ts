/**
 * Shared pieces for the Widget Kind builders (`models.ts` and `kindModels.ts`):
 * status derivation, the empty `KindView` every builder fills in, and the
 * placeholder figure for "cannot answer".
 */
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

/** The Stock page, where the market-stock rows and their per-market summary lead. */
export const STOCK_PATH = '/market/stock';

/** What a figure shows when the question cannot be answered at all, a lapsed grant, not a zero. */
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

/** Kinds whose lazy builder failed to load and has not landed since; `models.ts` owns it. */
export const failedBuilders = new Set<string>();

export const NEUTRAL_NUMBER: NumberModel = { value: UNKNOWN, tone: 'clear' };

/** A view with nothing in it yet; every builder starts from this and fills what it has. */
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

/**
 * A corp read this Character may not make: Grant access when the grant
 * lapsed, otherwise "your corp roles don't cover this" (a grant would not fix that).
 */
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

/** "3 h ago", or the unknown dash when never read. */
export function ageText(t: Translate, nowMs: number, atMs: number | null): string {
  return atMs === null ? UNKNOWN : formatAge(Math.max(0, nowMs - atMs), t);
}

export const count = (n: number): string => String(n);

export type Builder = (feeds: Feeds, ctx: BuildContext) => KindView;

/**
 * A kind with a Show setting: one builder per Show, all over the kind's feeds. `fallback`
 * draws a Show it has no builder for, which `viewSettings` never hands it but a test may.
 */
export function byShow(
  builders: Readonly<Partial<Record<WidgetShow, Builder>>>,
  fallback: Builder
): Builder {
  return (feeds, ctx) => ((ctx.show && builders[ctx.show]) || fallback)(feeds, ctx);
}

/**
 * Whether a kind's read covers every Character. `account` kinds can draw a widget
 * scoped to All characters (the builder narrows to the header Character when the
 * widget is not); a `character` kind cannot, and says so on the widget.
 */
export type KindScope = 'character' | 'account';

/** What one widget of a kind reads under its settings (`KindDef.bySettings`). */
export interface SettingsReads {
  feeds: readonly FeedId[];
  scope: KindScope;
  /** The endpoints its "needs permission" state asks for. */
  endpoints: readonly EsiEndpointId[];
}

/**
 * One widget kind, declared once: the feeds it reads, whether it sums across
 * Characters, and the builder that turns the feeds into a view. Which per-widget
 * settings change its view comes from the catalogue (`viewSettings.ts`), and its
 * Gallery preview and Role membership are checked against this table by
 * `kindRegistry.test.ts`.
 */
export interface KindDef {
  feeds: readonly FeedId[];
  scope: KindScope;
  /**
   * The feeds read *instead of* `feeds` by a widget scoped to All characters, for an
   * `account` kind whose All read is a fan-out of its own (the corp widgets: every
   * corporation the pilot's Characters can read). Left out, the same feeds serve both.
   */
  allFeeds?: readonly FeedId[];
  /**
   * The builder. With `loadBuild` it is the stand-in drawn until the real one lands
   * (loading, so no copy it would need is loaded yet).
   */
  build: Builder;
  /** The real builder, behind `import()` to keep its copy off the startup graph; `ensureBuilders` loads it. */
  loadBuild?: () => Promise<Builder>;
  /**
   * For a kind whose reads follow a per-widget setting (Profit's Source): the
   * feeds, scope and ESI endpoints under those settings. `feeds` above is then
   * every feed it may read, `scope` what it is with no settings, and the
   * catalogue's `endpoints` every endpoint it may need.
   */
  bySettings?: (settings: SettingsContext) => SettingsReads;
}

/** A row's severity as its detail modal's badge tone: the modal reads the same as the row's dot. */
export function detailToneOf(severity: DeadlineSeverity): DetailTone {
  if (severity === 'critical') return 'danger';
  return severity === 'warning' || severity === 'watch' ? 'warning' : 'neutral';
}

/**
 * A corp widget read across several corporations (All scope), so each row names its own: a
 * Corporation column after the first (the ticker, its full name in the tooltip and first in
 * the row's detail), and each list row's detail ending with the ticker. When one
 * corporation's read failed, the rest still draws, with a note under the figure and the
 * rows (not the Failed state, which would hide them). A read of one corporation is
 * returned unchanged.
 */
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
