import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useRosterNames } from './useRosterNames';

describe('useRosterNames', () => {
  beforeEach(async () => {
    await db.characters.clear();
  });

  it('maps every Character id to its name and follows later writes', async () => {
    await db.characters.put({ characterId: 1, name: 'One', ownerHash: 'a', addedAt: 1 });
    const { result } = renderHook(() => useRosterNames());
    await waitFor(() => expect(result.current?.get(1)).toBe('One'));

    await db.characters.put({ characterId: 2, name: 'Two', ownerHash: 'b', addedAt: 2 });
    await waitFor(() => expect(result.current?.size).toBe(2));
  });

  it('shares one read between hooks and starts clean after the last one leaves', async () => {
    await db.characters.put({ characterId: 1, name: 'One', ownerHash: 'a', addedAt: 1 });
    const first = renderHook(() => useRosterNames());
    const second = renderHook(() => useRosterNames());
    await waitFor(() => expect(second.result.current?.size).toBe(1));
    expect(first.result.current).toBe(second.result.current);

    first.unmount();
    second.unmount();
    const again = renderHook(() => useRosterNames());
    expect(again.result.current).toBeUndefined();
    again.unmount();
  });
});
