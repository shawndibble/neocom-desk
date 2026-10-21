import { describe, expect, it } from 'vitest';
import type { CorpAssetsFeed } from './corpFeeds';
import type { CorpAssetsSummary } from './corpAssetsSummary';
import type { CorpStockTargets } from '@/features/corp/stockTargets';
import { corpAssets } from './corpAssetsModels';
import type { BuildContext, FeedState, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length ? `${key}${JSON.stringify(options)}` : key;
const ctx = { t, now: 0, activeCharacterId: 1, range: 30 } as unknown as BuildContext;
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

const summary = (over: Partial<CorpAssetsSummary> = {}): CorpAssetsSummary => ({
  assetSafety: { stacks: 0, value: 0 },
  impounded: { stacks: 0, value: 0 },
  deliveries: { stacks: 0, value: 0 },
  totalStacks: 10,
  usableByType: new Map([[34, 100]]),
  ...over,
});

const feeds = (
  s: CorpAssetsSummary | null,
  targets: CorpStockTargets = {},
  over: Partial<CorpAssetsFeed> = {}
): Feeds => ({
  corpAssets: ok<CorpAssetsFeed>({
    readable: s !== null,
    needsReauth: false,
    fetchedAt: new Date(0),
    fromCache: false,
    corporationId: 98000001,
    summary: s,
    truncated: false,
    ...over,
  }),
  corpStockTargets: ok(targets),
});

describe('corpAssets', () => {
  it('is blank while loading, and unreadable keeps its own message and state', () => {
    expect(corpAssets({}, ctx).status.hasData).toBe(false);
    const view = corpAssets(feeds(null, {}, { needsReauth: true, corporationId: null }), ctx);
    expect(view.status.needsPermission).toBe(true);
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
    expect(corpAssets(feeds(null), ctx).status.needsPermission).toBe(false);
  });

  it('shows only non-zero lines, with danger and warning tones and their links', () => {
    const view = corpAssets(
      feeds(
        summary({
          assetSafety: { stacks: 4, value: 2_000_000 },
          deliveries: { stacks: 2, value: 5 },
        }),
        { '98000001': { '34': 500, '35': 1 } }
      ),
      ctx
    );
    expect(view.rows.map((r) => [r.key, r.tone, r.to])).toEqual([
      ['safety', 'critical', '/corp/assets/safety'],
      ['deliveries', 'warning', '/corp/assets/deliveries'],
      ['belowTarget', 'warning', '/corp/assets?below=1'],
    ]);
    expect(view.table?.rows.map((r) => r.key)).toEqual(['safety', 'deliveries', 'belowTarget']);
    expect(view.number.value).toBe('3');
    expect(view.number.tone).toBe('critical');
    expect(view.status.isEmpty).toBe(false);
  });

  it('counts below target from this corporation only', () => {
    const view = corpAssets(
      feeds(summary(), { '1': { '34': 999 }, '98000001': { '34': 100 } }),
      ctx
    );
    expect(view.rows).toEqual([]);
  });

  it('is an all-clear when everything is zero, distinct from a corp with nothing', () => {
    const clear = corpAssets(feeds(summary()), ctx);
    expect(clear.status.isEmpty).toBe(true);
    expect(clear.emptyMessage).toBe('overview.widgets.corpAssets.allClear');
    expect(clear.number).toMatchObject({ value: '0', tone: 'clear' });
    const nothing = corpAssets(feeds(summary({ totalStacks: 0, usableByType: new Map() })), ctx);
    expect(nothing.emptyMessage).toBe('overview.widgets.corpAssets.empty');
  });

  it('warns only when just deliveries or targets need attention', () => {
    const view = corpAssets(feeds(summary({ deliveries: { stacks: 1, value: 0 } })), ctx);
    expect(view.number.tone).toBe('warning');
  });
});
