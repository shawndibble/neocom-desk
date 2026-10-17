import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useCurrentSurveyId, useSurveyPriceHub } from '@/features/survey/surveyPref';
import { loadSurveyWidget } from './kindLoaders';

const loadOrePrices = vi.fn(async () => ({ prices: new Map<string, number>(), compressed: true }));
vi.mock('@/features/survey/orePrices', () => ({
  loadOrePrices: (...args: unknown[]) => loadOrePrices(...(args as [])),
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

  it('follows the hub picked on the Survey page', async () => {
    await db.settings.put({ key: 'miningSurveyCurrent', value: 'k7m2xq' });
    await db.settings.put({ key: 'miningSurveyPriceHub', value: 'amarr' });
    await loadSurveyWidget();
    expect(loadOrePrices).toHaveBeenLastCalledWith([], expect.objectContaining({ id: 'amarr' }));
  });
});
