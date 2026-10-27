import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { DEFAULT_LP_VALUE, LP_VALUE_SETTING_KEY, useLpValue } from './lpValue';

beforeEach(async () => {
  await db.settings.clear();
  useLpValue.setState({ value: DEFAULT_LP_VALUE, hydrated: false });
});

async function hydrated(): Promise<number> {
  await useLpValue.getState().hydrate();
  return useLpValue.getState().value;
}

describe('useLpValue', () => {
  it('defaults to 0 — an LP pick is priced at its ISK cost alone until the pilot says otherwise', async () => {
    expect(await hydrated()).toBe(0);
  });

  it('round-trips a stored rate', async () => {
    await db.settings.put({ key: LP_VALUE_SETTING_KEY, value: 1250.5 });
    expect(await hydrated()).toBe(1250.5);
  });

  it('rejects a negative or non-numeric stored rate', async () => {
    await db.settings.put({ key: LP_VALUE_SETTING_KEY, value: -5 });
    expect(await hydrated()).toBe(0);
    await db.settings.put({ key: LP_VALUE_SETTING_KEY, value: 'lots' });
    expect(await hydrated()).toBe(0);
  });
});
