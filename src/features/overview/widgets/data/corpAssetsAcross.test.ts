import { describe, expect, it } from 'vitest';
import type { CorpAllFeed, CorpAssetsFeed } from './corpFeeds';
import { buildView } from './models';
import { registerKindDefs } from './models';
import { CORP_DEFS } from './corpModels';
import type { BuildContext, FeedState } from './types';

registerKindDefs(CORP_DEFS);

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = (patch: Partial<BuildContext> = {}): BuildContext => ({
  t,
  now: 0,
  activeCharacterId: 1,
  scopeAll: true,
  notTrainingAlert: false,
  range: 30,
  ...patch,
});
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

const read = (
  corporationId: number,
  safety: number,
  usable: [number, number][] = []
): CorpAssetsFeed => ({
  readable: true,
  needsReauth: false,
  fetchedAt: new Date(corporationId),
  fromCache: false,
  corporationId,
  truncated: false,
  summary: {
    assetSafety: { stacks: safety, value: safety * 10 },
    impounded: { stacks: 0, value: 0 },
    deliveries: { stacks: 0 },
    totalStacks: 5,
    usableByType: new Map(usable),
  },
});
const all = (...feeds: CorpAssetsFeed[]): CorpAllFeed<CorpAssetsFeed> => ({
  corporations: feeds.map((feed) => ({ corporationId: feed.corporationId!, feed })),
  labels: new Map(
    feeds.map((feed) => [feed.corporationId!, { ticker: `T${feed.corporationId}`, name: 'c' }])
  ),
  partlyFailed: false,
});
const targets = (perCorp: Record<number, Record<number, number>>) => ok(perCorp as never);

describe('Corp assets across every corporation', () => {
  it('reads its own feeds when scoped to All', async () => {
    const { feedsOf, kindSumsAcrossCharacters } = await import('./models');
    expect(kindSumsAcrossCharacters('corpAssets')).toBe(true);
    expect(feedsOf('corpAssets', undefined, true)).toEqual(['corpAssetsAll', 'corpStockTargets']);
    expect(feedsOf('corpAssets')).toEqual(['corpAssets', 'corpStockTargets']);
  });

  it('sums the asset safety stacks and values over the corporations', () => {
    const view = buildView(
      'corpAssets',
      { corpAssetsAll: ok(all(read(1, 2), read(2, 3))), corpStockTargets: targets({}) },
      ctx()
    );
    const safety = view.rows.find((row) => row.key === 'safety');
    expect(safety?.value).toBe('overview.widgets.corpAssets.safetyCount{"count":5}');
    expect(view.table?.rows[0]?.cells[2]).toMatchObject({ iskAmount: 50 });
  });
});
