import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { migrateSpendCap, useImproveBudget } from './useImprove';

beforeEach(async () => {
  await db.settings.clear();
  useImproveBudget.setState({ value: null, hydrated: false });
});

describe('Improve budget migration', () => {
  it('moves the old shared cap to the budget when Planning was the mode', async () => {
    await db.settings.bulkPut([
      { key: 'fittingsImproveSpendCap', value: 8_000_000 },
      { key: 'fittingsImproveMode', value: 'buy' },
    ]);
    await migrateSpendCap();
    expect(useImproveBudget.getState().value).toBe(8_000_000);
    expect(await db.settings.get('fittingsImproveSpendCap')).toBeUndefined();
  });

  it('moves it to the budget when no mode is stored, the default mode', async () => {
    await db.settings.put({ key: 'fittingsImproveSpendCap', value: 8_000_000 });
    await migrateSpendCap();
    expect(useImproveBudget.getState().value).toBe(8_000_000);
  });

  it('drops a Refitting cap instead of making it the budget', async () => {
    await db.settings.bulkPut([
      { key: 'fittingsImproveSpendCap', value: 8_000_000 },
      { key: 'fittingsImproveMode', value: 'refit' },
      { key: 'fittingsImproveRefitCap', value: 3_000_000 },
    ]);
    await migrateSpendCap();
    expect(useImproveBudget.getState().value).toBeNull();
    expect(await db.settings.get('fittingsImproveSpendCap')).toBeUndefined();
    expect(await db.settings.get('fittingsImproveMode')).toBeUndefined();
    expect(await db.settings.get('fittingsImproveRefitCap')).toBeUndefined();
  });
});
