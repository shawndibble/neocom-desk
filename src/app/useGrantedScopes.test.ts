import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ESI_REGISTRY } from '@/esi/registry';
import {
  characterIdsWithScopes,
  useCharacterIdsWithScopes,
  useEndpointsGranted,
} from './useGrantedScopes';
import { seedGrant as seedGrantFor } from '@/test/seed';

const CHARACTER_ID = 42;
const OTHER_SCOPE = ESI_REGISTRY.getCharacterAssets.scope;
const IMPLANTS_SCOPE = ESI_REGISTRY.getCharacterImplants.scope;

async function seedGrant(scopes: readonly string[], characterId = CHARACTER_ID): Promise<void> {
  await seedGrantFor(characterId, scopes);
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

describe('characterIdsWithScopes', () => {
  it('lists the Characters whose grant covers every scope', async () => {
    await seedGrant([OTHER_SCOPE, IMPLANTS_SCOPE], 1);
    await seedGrant([OTHER_SCOPE], 2);
    await seedGrant([OTHER_SCOPE, IMPLANTS_SCOPE], 3);
    expect(await characterIdsWithScopes([OTHER_SCOPE, IMPLANTS_SCOPE])).toEqual([1, 3]);
    expect(await characterIdsWithScopes([OTHER_SCOPE])).toEqual([1, 2, 3]);
  });

  it('narrows to the given Characters and skips unknown ids', async () => {
    await seedGrant([OTHER_SCOPE], 1);
    await seedGrant([OTHER_SCOPE], 2);
    expect(await characterIdsWithScopes([OTHER_SCOPE], [2, 99])).toEqual([2]);
  });
});

describe('useCharacterIdsWithScopes', () => {
  it('is undefined until read, then the covered ids', async () => {
    await seedGrant([OTHER_SCOPE], 1);
    await seedGrant([], 2);
    const { result } = renderHook(() => useCharacterIdsWithScopes([OTHER_SCOPE]));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect([...(result.current ?? [])]).toEqual([1]));
  });
});
