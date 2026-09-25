import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ESI_REGISTRY } from '@/esi/registry';
import { useEndpointsGranted } from './useGrantedScopes';

const CHARACTER_ID = 42;
const OTHER_SCOPE = ESI_REGISTRY.getCharacterAssets.scope;
const IMPLANTS_SCOPE = ESI_REGISTRY.getCharacterImplants.scope;

async function seedGrant(
  scopes: readonly string[],
  characterId: number = CHARACTER_ID
): Promise<void> {
  await db.tokens.put({
    characterId,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
    scopes: [...scopes],
  });
}

beforeEach(async () => {
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
});

describe('useEndpointsGranted', () => {
  it('is undefined while the grant is still unknown', () => {
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: false });
    const { result } = renderHook(() => useEndpointsGranted(['getCharacterImplants']));
    expect(result.current).toBeUndefined();
  });

  it('is false when the endpoint’s scope is missing', async () => {
    await seedGrant([OTHER_SCOPE]);
    const { result } = renderHook(() => useEndpointsGranted(['getCharacterImplants']));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('is true once the endpoint’s scope is granted', async () => {
    await seedGrant([IMPLANTS_SCOPE]);
    const { result } = renderHook(() => useEndpointsGranted(['getCharacterImplants']));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('treats a character with no stored token as granting nothing', async () => {
    const { result } = renderHook(() => useEndpointsGranted(['getCharacterImplants']));
    await waitFor(() => expect(result.current).toBe(false));
  });

  describe('for an explicit character (issue #1589)', () => {
    const OTHER_CHARACTER_ID = 99;

    it('reads that character’s grant, not the active one’s', async () => {
      await seedGrant([IMPLANTS_SCOPE]);
      await seedGrant([OTHER_SCOPE], OTHER_CHARACTER_ID);
      const { result } = renderHook(() =>
        useEndpointsGranted(['getCharacterImplants'], OTHER_CHARACTER_ID)
      );
      await waitFor(() => expect(result.current).toBe(false));
    });

    it('does not wait on the active character’s hydration', async () => {
      useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
      await seedGrant([IMPLANTS_SCOPE], OTHER_CHARACTER_ID);
      const { result } = renderHook(() =>
        useEndpointsGranted(['getCharacterImplants'], OTHER_CHARACTER_ID)
      );
      await waitFor(() => expect(result.current).toBe(true));
    });

    it('is undefined for no character at all', () => {
      const { result } = renderHook(() => useEndpointsGranted(['getCharacterImplants'], null));
      expect(result.current).toBeUndefined();
    });
  });
});
