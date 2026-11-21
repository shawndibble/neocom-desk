import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useCurrentSurveyId } from '@/features/survey/surveyPref';
import { resetHubStores } from '@/test/hubStores';
import { loadSurveyWidget } from './kindLoaders';

const loadOrePrices = vi.fn(async () => ({ prices: new Map<string, number>(), compressed: true }));
vi.mock('@/features/survey/orePrices', () => ({
  loadOrePrices: (...args: unknown[]) => loadOrePrices(...(args as [])),
}));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({ '1230': { name: 'Veldspar' }, '34': { name: 'Tritanium' } })),
  loadOreAndIceTypeIds: vi.fn(async () => [1230]),
}));
vi.mock('@/features/survey/surveyStore', () => ({
  loadSurvey: vi.fn(async () => ({
    ok: true,
    scans: [],
    expiresAt: 0,
    owner: null,
    tax: null,
    info: null,
    ignored: new Set<string>(),
  })),
}));

describe('loadSurveyWidget', () => {
  beforeEach(async () => {
    await db.settings.clear();
    loadOrePrices.mockClear();
    useCurrentSurveyId.setState({ value: null, hydrated: false });
    resetHubStores();
  });

  it('prices at the Global hub while Mining has no hub of its own', async () => {
    await db.settings.put({ key: 'miningSurveyCurrent', value: 'k7m2xq' });
    await db.settings.put({ key: 'sync.marketHub', value: 'amarr' });
    await loadSurveyWidget();
    expect(loadOrePrices).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ id: 'amarr' }),
      100
    );
  });

  it("prices at Mining's own hub over the Global hub", async () => {
    await db.settings.bulkPut([
      { key: 'miningSurveyCurrent', value: 'k7m2xq' },
      { key: 'sync.marketHub', value: 'amarr' },
      { key: 'sync.pageHubs', value: { mining: 'jita' } },
    ]);
    await loadSurveyWidget();
    expect(loadOrePrices).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ id: 'jita' }),
      100
    );
  });

  it("prices at Mining's price percent", async () => {
    await db.settings.bulkPut([
      { key: 'miningSurveyCurrent', value: 'k7m2xq' },
      { key: 'sync.pagePricePercents', value: { mining: 90 } },
    ]);
    await loadSurveyWidget();
    expect(loadOrePrices).toHaveBeenLastCalledWith([], expect.objectContaining({ id: 'jita' }), 90);
  });

  it("maps each ore name to its type id for the rows' Show info", async () => {
    await db.settings.put({ key: 'miningSurveyCurrent', value: 'k7m2xq' });
    const data = await loadSurveyWidget();
    expect([...(data.oreTypeIds ?? [])]).toEqual([['Veldspar', 1230]]);
  });

  it('folds a hub picked on the Survey page before page hubs into Mining, once', async () => {
    await db.settings.put({ key: 'miningSurveyCurrent', value: 'k7m2xq' });
    await db.settings.put({ key: 'miningSurveyPriceHub', value: 'amarr' });
    await loadSurveyWidget();
    expect(loadOrePrices).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ id: 'amarr' }),
      100
    );
  });
});
