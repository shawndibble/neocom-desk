import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db, type CharacterRecord } from '@/db';
import {
  useAccountCharacters,
  useCharacterCount,
  useCharacterCountOrLoading,
  useCharacterNames,
  useCharacters,
} from './useCharacters';

const row = (characterId: number, name: string) =>
  ({ characterId, name, addedAt: characterId }) as unknown as CharacterRecord;

beforeEach(async () => {
  await db.characters.clear();
});

describe('useCharacters', () => {
  it('is a stable empty array while loading, then the stored rows', async () => {
    await db.characters.bulkPut([row(1, 'Alpha'), row(2, 'Beta')]);
    const { result, rerender } = renderHook(() => useCharacters());
    const loading = result.current;
    expect(loading).toEqual([]);
    rerender();
    expect(result.current).toBe(loading);
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('updates when a Character is added', async () => {
    const { result } = renderHook(() => useCharacters());
    await db.characters.put(row(3, 'Gamma'));
    await waitFor(() => expect(result.current.map((c) => c.name)).toEqual(['Gamma']));
  });
});

describe('useCharacterCountOrLoading', () => {
  it('is undefined while loading, then the count', async () => {
    await db.characters.put(row(1, 'Alpha'));
    const { result } = renderHook(() => useCharacterCountOrLoading());
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(1));
  });
});

describe('useCharacterNames / useAccountCharacters / useCharacterCount', () => {
  it('maps ids to names and candidates', async () => {
    await db.characters.bulkPut([row(1, 'Alpha'), row(2, 'Beta')]);
    const names = renderHook(() => useCharacterNames());
    const account = renderHook(() => useAccountCharacters());
    const count = renderHook(() => useCharacterCount());
    expect(names.result.current.size).toBe(0);
    await waitFor(() => expect(names.result.current.get(2)).toBe('Beta'));
    await waitFor(() =>
      expect(account.result.current.candidates).toEqual([
        { characterId: 1, characterName: 'Alpha' },
        { characterId: 2, characterName: 'Beta' },
      ])
    );
    expect(account.result.current.namesById.get(1)).toBe('Alpha');
    await waitFor(() => expect(count.result.current).toBe(2));
  });

  it('keeps the names Map identity across rerenders', async () => {
    await db.characters.put(row(1, 'Alpha'));
    const { result, rerender } = renderHook(() => useCharacterNames());
    await waitFor(() => expect(result.current.size).toBe(1));
    const loaded = result.current;
    rerender();
    expect(result.current).toBe(loaded);
  });
});
