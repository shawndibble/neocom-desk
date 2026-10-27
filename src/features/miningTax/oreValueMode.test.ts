import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { MINING_TAX_ORE_VALUE_MODE_KEY, useMiningTaxOreValueMode } from './oreValueMode';

beforeEach(async () => {
  await db.settings.clear();
  useMiningTaxOreValueMode.setState({ value: false, hydrated: false });
});

describe('useMiningTaxOreValueMode', () => {
  it('defaults off', async () => {
    await useMiningTaxOreValueMode.getState().hydrate();
    expect(useMiningTaxOreValueMode.getState().value).toBe(false);
  });

  it('persists a change under the sync.-prefixed key', async () => {
    await useMiningTaxOreValueMode.getState().setValue(true);
    const row = await db.settings.get(MINING_TAX_ORE_VALUE_MODE_KEY);
    expect(row?.value).toBe(true);
  });

  it('applies a persisted value on hydrate', async () => {
    await db.settings.put({ key: MINING_TAX_ORE_VALUE_MODE_KEY, value: true });
    await useMiningTaxOreValueMode.getState().hydrate();
    expect(useMiningTaxOreValueMode.getState().value).toBe(true);
  });
});
