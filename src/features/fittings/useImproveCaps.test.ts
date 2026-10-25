import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { migrateSpendCap, useImproveBudget, useImproveRefitCap } from './useImprove';

beforeEach(async () => {
  await db.settings.clear();
  useImproveBudget.setState({ value: null, hydrated: false });
  useImproveRefitCap.setState({ value: null, hydrated: false });
});

describe('Improve budget and refit cap', () => {
  it('keeps the Refitting cap and the Planning budget apart', async () => {
    await useImproveRefitCap.getState().setValue(5_000_000);
    expect(useImproveBudget.getState().value).toBeNull();
    await useImproveBudget.getState().setValue(50_000_000);
    expect(useImproveRefitCap.getState().value).toBe(5_000_000);
  });

  it('moves the old shared cap to the mode that was active', async () => {
    await db.settings.bulkPut([
      { key: 'fittingsImproveSpendCap', value: 8_000_000 },
      { key: 'fittingsImproveMode', value: 'buy' },
    ]);
    await migrateSpendCap();
    expect(useImproveBudget.getState().value).toBe(8_000_000);
    expect(useImproveRefitCap.getState().value).toBeNull();
    expect(await db.settings.get('fittingsImproveSpendCap')).toBeUndefined();
  });

  it('moves it to Refitting when no mode is stored', async () => {
    await db.settings.put({ key: 'fittingsImproveSpendCap', value: 8_000_000 });
    await migrateSpendCap();
    expect(useImproveRefitCap.getState().value).toBe(8_000_000);
    expect(useImproveBudget.getState().value).toBeNull();
  });
});
