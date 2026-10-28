import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useCurrentSurveyId, useSurveyPriceHub } from '@/features/survey/surveyPref';
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
    useSurveyPriceHub.setState({ value: 'jita', hydrated: false });
  });

  it('prices at the Survey page hub, Jita by default, whatever the Settings hub', async () => {
    await db.settings.put({ key: 'miningSurveyCurrent', value: 'k7m2xq' });
    await db.settings.put({ key: 'sync.marketHub', value: 'amarr' });
    await loadSurveyWidget();
    expect(loadOrePrices).toHaveBeenLastCalledWith([], expect.objectContaining({ id: 'jita' }));
  });

  it("maps each ore name to its type id for the rows' Show info", async () => {
    await db.settings.put({ key: 'miningSurveyCurrent', value: 'k7m2xq' });
    const data = await loadSurveyWidget();
    expect([...(data.oreTypeIds ?? [])]).toEqual([['Veldspar', 1230]]);
  });

  it('follows the hub picked on the Survey page', async () => {
    await db.settings.put({ key: 'miningSurveyCurrent', value: 'k7m2xq' });
    await db.settings.put({ key: 'miningSurveyPriceHub', value: 'amarr' });
    await loadSurveyWidget();
    expect(loadOrePrices).toHaveBeenLastCalledWith([], expect.objectContaining({ id: 'amarr' }));
  });
});
