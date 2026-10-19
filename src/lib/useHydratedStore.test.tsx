import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { createLocalSetting } from './useLocalSetting';
import { useHydratedStore } from './useHydratedStore';

let keySeq = 0;
function freshStore<T>(defaultValue: T) {
  return createLocalSetting<T>({ key: `test.hydrated.${++keySeq}`, defaultValue });
}

beforeEach(async () => {
  await db.settings.clear();
});

describe('useHydratedStore', () => {
  it('hydrates a store on mount and reports when it settles', async () => {
    const useSetting = freshStore('a');
    const { result } = renderHook(() => useHydratedStore(useSetting));
    await waitFor(() => expect(result.current).toBe(true));
    expect(useSetting.getState().hydrated).toBe(true);
  });

  it('is false until every store has settled', async () => {
    const first = freshStore('a');
    const second = freshStore(1);
    await act(async () => {
      await first.getState().hydrate();
    });
    const { result } = renderHook(() => useHydratedStore(first, second));
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(second.getState().hydrated).toBe(true);
  });

  it('is true at once for stores that already hydrated', async () => {
    const useSetting = freshStore('a');
    await useSetting.getState().hydrate();
    const { result } = renderHook(() => useHydratedStore(useSetting));
    expect(result.current).toBe(true);
  });
});
