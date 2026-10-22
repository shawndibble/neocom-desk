import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useNetWorthMissingNames } from './useNetWorthData';
import { REQUIRED_SCOPES } from './recordSnapshots';

const A = { characterId: 1, name: 'Ava' };
const B = { characterId: 2, name: 'Bo' };
const C = { characterId: 3, name: 'Cy' };

beforeEach(async () => {
  await db.delete();
  await db.open();
  for (const [id, scopes] of [
    [1, REQUIRED_SCOPES],
    [2, REQUIRED_SCOPES],
    [3, []],
  ] as const) {
    await db.tokens.put({
      characterId: id,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 0,
      scopes: [...scopes],
    });
  }
});

describe('useNetWorthMissingNames', () => {
  it('names the Characters without every snapshot permission', async () => {
    const { result } = renderHook(() => useNetWorthMissingNames([A, B, C]));
    await waitFor(() => expect(result.current).toEqual(['Cy']));
  });

  it('never flashes the new Characters as missing on the render after they change', async () => {
    const { result, rerender } = renderHook(({ chars }) => useNetWorthMissingNames(chars), {
      initialProps: { chars: [C] as readonly (typeof A)[] },
    });
    await waitFor(() => expect(result.current).toEqual(['Cy']));

    // The first render with the new list, before any query could re-run.
    rerender({ chars: [A, B] });
    expect(result.current).toEqual([]);
  });
});
