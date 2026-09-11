import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { CorpAccess, CorpAccessState } from '@/features/corp/useCorpAccess';

const loadCorporationBlueprints = vi.fn();
vi.mock('@/features/corp/blueprints', () => ({
  loadCorporationBlueprints: (characterId: number, corporationId: number) =>
    loadCorporationBlueprints(characterId, corporationId),
}));

const useCorpAccess = vi.fn();
vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: () => useCorpAccess() }));

let activeCorporationId: number | null = null;
vi.mock('@/features/corp/owner', () => ({
  useActiveCorporationId: () => activeCorporationId,
}));

const { useCorpOwnedBlueprints } = await import('./corpOwnedBlueprints');

const BLUEPRINT = {
  item_id: 1,
  type_id: 34,
  runs: -1,
  material_efficiency: 10,
  time_efficiency: 20,
  quantity: 1,
  location_id: 60003760,
  location_flag: 'CorpSAG1',
};

function accessOf(state: CorpAccessState, capabilities: Partial<CorpCapabilities>): CorpAccess {
  return {
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, ...capabilities },
    missingScopes: [],
    roles: [],
  };
}

const CHARACTER_ID = 91;
const OTHER_CHARACTER_ID = 92;
const CORPORATION_ID = 500;
const OTHER_CORPORATION_ID = 600;

describe('useCorpOwnedBlueprints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeCorporationId = CORPORATION_ID;
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    useCorpAccess.mockReturnValue(accessOf('ready', { canReadBlueprints: true }));
    loadCorporationBlueprints.mockResolvedValue({
      cached: { data: [BLUEPRINT], truncated: false },
    });
  });

  it('is unavailable without the canReadBlueprints capability, even with a known corporation', async () => {
    useCorpAccess.mockReturnValue(accessOf('ready', {}));
    const { result } = renderHook(() => useCorpOwnedBlueprints());
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.blueprints).toEqual([]);
    expect(loadCorporationBlueprints).not.toHaveBeenCalled();
  });

  it('fetches and exposes the active corporation as a source once available', async () => {
    const { result } = renderHook(() => useCorpOwnedBlueprints());
    await waitFor(() => expect(result.current.blueprints).toEqual([BLUEPRINT]));
    expect(result.current.available).toBe(true);
  });

  it('re-resolves to the new corporation when the active character switches', async () => {
    const { result, rerender } = renderHook(() => useCorpOwnedBlueprints());
    await waitFor(() => expect(result.current.blueprints).toEqual([BLUEPRINT]));

    const otherBlueprint = { ...BLUEPRINT, item_id: 2, type_id: 35 };
    loadCorporationBlueprints.mockResolvedValue({
      cached: { data: [otherBlueprint], truncated: false },
    });
    activeCorporationId = OTHER_CORPORATION_ID;
    useActiveCharacter.setState({ activeCharacterId: OTHER_CHARACTER_ID, hydrated: true });
    rerender();

    await waitFor(() => expect(result.current.blueprints).toEqual([otherBlueprint]));
  });

  it('clears the source when the newly active character lacks the capability', async () => {
    const { result, rerender } = renderHook(() => useCorpOwnedBlueprints());
    await waitFor(() => expect(result.current.available).toBe(true));

    useCorpAccess.mockReturnValue(accessOf('ready', {}));
    useActiveCharacter.setState({ activeCharacterId: OTHER_CHARACTER_ID, hydrated: true });
    rerender();

    expect(result.current.available).toBe(false);
    expect(result.current.blueprints).toEqual([]);
  });

  it('never surfaces a stale result from the previous character while the new fetch is in flight', async () => {
    const { result, rerender } = renderHook(() => useCorpOwnedBlueprints());
    await waitFor(() => expect(result.current.blueprints).toEqual([BLUEPRINT]));

    let resolveNext: (value: unknown) => void = () => {};
    loadCorporationBlueprints.mockReturnValue(
      new Promise((resolve) => {
        resolveNext = resolve;
      })
    );
    activeCorporationId = OTHER_CORPORATION_ID;
    useActiveCharacter.setState({ activeCharacterId: OTHER_CHARACTER_ID, hydrated: true });
    rerender();

    expect(result.current.blueprints).toEqual([]);

    resolveNext({ cached: { data: [BLUEPRINT], truncated: false } });
    await waitFor(() => expect(result.current.blueprints).toEqual([BLUEPRINT]));
  });
});
