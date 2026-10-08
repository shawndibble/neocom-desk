import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { useLpBasis, LP_BASIS_SETTING_KEY, DEFAULT_LP_BASIS } from './lpBasis';

beforeEach(async () => {
  await db.settings.clear();
  useLpBasis.setState({ value: DEFAULT_LP_BASIS, hydrated: false });
});

describe('useLpBasis', () => {
  it('defaults to corporation LP, unhydrated', () => {
    expect(useLpBasis.getState().value).toBe('lp');
    expect(useLpBasis.getState().hydrated).toBe(false);
  });

  it('persists a "concord" choice to Dexie under the loyaltyStoreLpBasis key', async () => {
    await useLpBasis.getState().setValue('concord');
    expect((await db.settings.get(LP_BASIS_SETTING_KEY))?.value).toBe('concord');
  });

  it('applies a persisted value on hydrate', async () => {
    await db.settings.put({ key: LP_BASIS_SETTING_KEY, value: 'concord' });
    await useLpBasis.getState().hydrate();
    expect(useLpBasis.getState().value).toBe('concord');
  });

  it('falls back to the default for a bogus stored value', async () => {
    await db.settings.put({ key: LP_BASIS_SETTING_KEY, value: 'bogus' });
    await useLpBasis.getState().hydrate();
    expect(useLpBasis.getState().value).toBe(DEFAULT_LP_BASIS);
  });
});
