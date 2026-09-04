import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpAccess, type CorpAccess, type CorpAccessState } from './useCorpAccess';
import { useActiveCorporationId, useCorpOwner } from './owner';

vi.mock('./useCorpAccess', () => ({ useCorpAccess: vi.fn() }));

const mockedAccess = vi.mocked(useCorpAccess);

const CHARACTER_ID = 91;
const OTHER_CHARACTER_ID = 92;
const CORPORATION_ID = 98000001;

function accessOf(state: CorpAccessState, capabilities: Partial<CorpCapabilities>): CorpAccess {
  return {
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, ...capabilities },
    missingScopes: [],
    roles: [],
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.characters.clear();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
  mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
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

describe('useCorpOwner', () => {
  beforeEach(async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot',
      ownerHash: 'h',
      addedAt: 0,
      corporationId: CORPORATION_ID,
    });
  });

  it('starts on Personal', async () => {
    const { result } = renderHook(() => useCorpOwner('canReadWallet'));
    await waitFor(() => expect(result.current.corporationId).toBe(CORPORATION_ID));
    expect(result.current.owner).toBe('personal');
  });

  it('is unavailable without the capability, even with a known corporation', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', {}));
    const { result } = renderHook(() => useCorpOwner('canReadWallet'));
    await waitFor(() => expect(result.current.corporationId).toBe(CORPORATION_ID));
    expect(result.current.available).toBe(false);
  });

  it('is unavailable with the capability but no known corporation', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot',
      ownerHash: 'h',
      addedAt: 0,
    });
    const { result } = renderHook(() => useCorpOwner('canReadWallet'));
    await waitFor(() => expect(result.current.corporationId).toBeNull());
    expect(result.current.available).toBe(false);
  });

  it('flips to Corporation and back via setOwner, while available', async () => {
    const { result } = renderHook(() => useCorpOwner('canReadWallet'));
    await waitFor(() => expect(result.current.available).toBe(true));

    result.current.setOwner('corporation');
    await waitFor(() => expect(result.current.owner).toBe('corporation'));

    result.current.setOwner('personal');
    await waitFor(() => expect(result.current.owner).toBe('personal'));
  });

  /**
   * The rule the module's own comment states: a state change that removed the
   * capability (a revoked grant, a lost role) must not leave a corp view on
   * screen with no switch left to get back to Personal.
   */
  it('forces back to Personal when the capability is lost while showing corp', async () => {
    const { result, rerender } = renderHook(() => useCorpOwner('canReadWallet'));
    await waitFor(() => expect(result.current.available).toBe(true));
    result.current.setOwner('corporation');
    await waitFor(() => expect(result.current.owner).toBe('corporation'));

    mockedAccess.mockReturnValue(accessOf('ready', {}));
    rerender();

    expect(result.current.available).toBe(false);
    expect(result.current.owner).toBe('personal');
  });

  /**
   * The other named guarantee: a Character switch resets the selection, since
   * the next Character may hold no corp role at all.
   */
  it('resets to Personal when the active character changes', async () => {
    const { result, rerender } = renderHook(() => useCorpOwner('canReadWallet'));
    await waitFor(() => expect(result.current.available).toBe(true));
    result.current.setOwner('corporation');
    await waitFor(() => expect(result.current.owner).toBe('corporation'));

    await db.characters.put({
      characterId: OTHER_CHARACTER_ID,
      name: 'Alt',
      ownerHash: 'h2',
      addedAt: 0,
      corporationId: CORPORATION_ID,
    });
    useActiveCharacter.setState({ activeCharacterId: OTHER_CHARACTER_ID, hydrated: true });
    rerender();

    expect(result.current.owner).toBe('personal');
  });
});
