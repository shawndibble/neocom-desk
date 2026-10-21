/**
 * Shared pieces for the Widget Kind builders (`models.ts` and `kindModels.ts`):
 * status derivation, the empty `KindView` every builder fills in, and the
 * placeholder figure for "cannot answer".
 */
import { formatAge } from '@/lib/age';
import type { WidgetStateInput } from '../state';
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

/** One widget kind: the feeds it reads and the builder that turns them into a view. */
export interface KindDef {
  feeds: readonly FeedId[];
  build: Builder;
}
