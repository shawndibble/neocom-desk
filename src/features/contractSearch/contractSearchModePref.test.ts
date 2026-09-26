import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  useContractSearchMode,
  CONTRACT_SEARCH_MODE_KEY,
  DEFAULT_CONTRACT_SEARCH_MODE,
} from './contractSearchModePref';

beforeEach(async () => {
  await db.settings.clear();
  useContractSearchMode.setState({ value: DEFAULT_CONTRACT_SEARCH_MODE, hydrated: false });
});

describe('useContractSearchMode', () => {
  it('defaults to items — the mode a pilot who has never touched the switch sees', () => {
    expect(useContractSearchMode.getState().value).toBe('items');
    expect(useContractSearchMode.getState().hydrated).toBe(false);
  });

  it('persists courier under the contractSearchMode key', async () => {
    await useContractSearchMode.getState().setValue('courier');
    expect((await db.settings.get(CONTRACT_SEARCH_MODE_KEY))?.value).toBe('courier');
  });

  it('applies a persisted mode on hydrate', async () => {
    await db.settings.put({ key: CONTRACT_SEARCH_MODE_KEY, value: 'courier' });
    await useContractSearchMode.getState().hydrate();
    expect(useContractSearchMode.getState().value).toBe('courier');
  });

  it('falls back to items when the stored value names no mode', async () => {
    await db.settings.put({ key: CONTRACT_SEARCH_MODE_KEY, value: 'history' });
    await useContractSearchMode.getState().hydrate();
    expect(useContractSearchMode.getState().value).toBe('items');
  });
});
