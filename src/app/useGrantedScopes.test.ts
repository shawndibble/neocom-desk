import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ESI_REGISTRY } from '@/esi/registry';
import { useCharactersLackingEndpoints, useEndpointsGranted } from './useGrantedScopes';

const CHARACTER_ID = 42;
const OTHER_SCOPE = ESI_REGISTRY.getCharacterAssets.scope;
const IMPLANTS_SCOPE = ESI_REGISTRY.getCharacterImplants.scope;

async function seedGrant(scopes: readonly string[], characterId = CHARACTER_ID): Promise<void> {
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
});

describe('useCharactersLackingEndpoints', () => {
  const ALT_ID = 43;

  it('lists only the characters whose own grant misses the endpoint’s scope', async () => {
    await seedGrant([IMPLANTS_SCOPE]);
    await seedGrant([OTHER_SCOPE], ALT_ID);
    const { result } = renderHook(() =>
      useCharactersLackingEndpoints([CHARACTER_ID, ALT_ID], ['getCharacterImplants'])
    );
    await waitFor(() => expect(result.current).toEqual([ALT_ID]));
  });

  it('checks each character’s own grant, not the active Character’s', async () => {
    await seedGrant([OTHER_SCOPE]);
    await seedGrant([IMPLANTS_SCOPE], ALT_ID);
    const { result } = renderHook(() =>
      useCharactersLackingEndpoints([ALT_ID], ['getCharacterImplants'])
    );
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it('treats a character with no stored token as lacking the scope', async () => {
    const { result } = renderHook(() =>
      useCharactersLackingEndpoints([ALT_ID], ['getCharacterImplants'])
    );
    await waitFor(() => expect(result.current).toEqual([ALT_ID]));
  });

  it('drops a character once its grant gains the scope', async () => {
    await seedGrant([OTHER_SCOPE], ALT_ID);
    const { result } = renderHook(() =>
      useCharactersLackingEndpoints([ALT_ID], ['getCharacterImplants'])
    );
    await waitFor(() => expect(result.current).toEqual([ALT_ID]));
    await seedGrant([IMPLANTS_SCOPE], ALT_ID);
    await waitFor(() => expect(result.current).toEqual([]));
  });
});
