import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from './owner';

const CHARACTER_ID = 91;
const CORPORATION_ID = 98000001;

beforeEach(async () => {
  await db.characters.clear();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
});

describe('useActiveCorporationId', () => {
  it('is null before the corporation id has ever been learned', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot',
      ownerHash: 'h',
      addedAt: 0,
    });
    const { result } = renderHook(() => useActiveCorporationId());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('reads the stored corporation id for the active character', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot',
      ownerHash: 'h',
      addedAt: 0,
      corporationId: CORPORATION_ID,
    });
    const { result } = renderHook(() => useActiveCorporationId());
    await waitFor(() => expect(result.current).toBe(CORPORATION_ID));
  });
});
