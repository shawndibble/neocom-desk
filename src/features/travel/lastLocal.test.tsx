import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useLastLocal } from './lastLocal';

describe('useLastLocal', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('reads null on the first paste and stores it under a device-local key', async () => {
    const { result } = renderHook(() => useLastLocal(['A', 'B']));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBeNull());
    await waitFor(async () => {
      expect((await db.settings.get('local.lastPaste'))?.value).toEqual(['A', 'B']);
    });
    expect('local.lastPaste'.startsWith('sync.')).toBe(false);
  });

  it('hands the next paste the one before it, and never the stale answer', async () => {
    await db.settings.put({ key: 'local.lastPaste', value: ['A', 'B'] });
    const { result, rerender } = renderHook(({ names }) => useLastLocal(names), {
      initialProps: { names: ['A', 'B', 'C'] },
    });
    await waitFor(() => expect(result.current).toEqual(['A', 'B']));
    rerender({ names: ['X', 'Y'] });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual(['A', 'B', 'C']));
  });

  it('keeps the comparison base when the same names are seen again', async () => {
    await db.settings.put({ key: 'local.lastPaste', value: ['A', 'B'] });
    const { result } = renderHook(() => useLastLocal(['A', 'B']));
    await waitFor(() => expect(result.current).toEqual(['A', 'B']));
    expect((await db.settings.get('local.lastPaste'))?.value).toEqual(['A', 'B']);
  });
});
