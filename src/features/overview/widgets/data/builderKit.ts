/**
 * Shared pieces for the Widget Kind builders (`models.ts` and `kindModels.ts`):
 * status derivation, the empty `KindView` every builder fills in, and the
 * placeholder figure for "cannot answer".
 */
import type { WidgetStateInput } from '../state';
import type { BuildContext, FeedState, Feeds, KindView, NumberModel } from './types';

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

export const count = (n: number): string => String(n);

export type Builder = (feeds: Feeds, ctx: BuildContext) => KindView;
