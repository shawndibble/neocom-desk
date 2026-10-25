/**
 * Shared pieces for the Widget Kind builders (`models.ts` and `kindModels.ts`):
 * status derivation, the empty `KindView` every builder fills in, and the
 * placeholder figure for "cannot answer".
 */
import { formatAge } from '@/lib/age';
import type { WidgetStateInput } from '../state';
import type { EsiEndpointId } from '@/esi/registry';
import type { SettingsContext } from './viewSettings';
import type {
  BuildContext,
  FeedId,
  FeedState,
  Feeds,
  KindView,
  NumberModel,
  Translate,
} from './types';

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
