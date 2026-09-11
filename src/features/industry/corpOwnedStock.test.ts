import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import type { CorpAccess, CorpAccessState } from '@/features/corp/useCorpAccess';

const loadCorporationAssets = vi.fn();
vi.mock('@/features/corp/assets', () => ({
  loadCorporationAssets: (characterId: number, corporationId: number) =>
    loadCorporationAssets(characterId, corporationId),
}));

const useCorpAccess = vi.fn();
vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: () => useCorpAccess() }));

let activeCorporationId: number | null = null;
vi.mock('@/features/corp/owner', () => ({
  useActiveCorporationId: () => activeCorporationId,
}));

const { loadCorpOwnedStockSource, useCorpOwnedStockSource } = await import('./corpOwnedStock');

const ASSET = {
  item_id: 1,
  type_id: 34,
  quantity: 4000,
  location_id: 60003760,
  location_type: 'station' as const,
  location_flag: 'CorpSAG1',
  is_singleton: false,
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

describe('loadCorpOwnedStockSource', () => {
  it('turns the corp asset read into an owned-stock source tagged with the corporation', async () => {
    loadCorporationAssets.mockResolvedValue({ cached: { data: [ASSET], truncated: false } });

    const result = await loadCorpOwnedStockSource(91, 500);

    expect(result).toEqual({
      source: { characterId: 91, corporationId: 500, assets: [ASSET] },
      truncated: false,
    });
  });

  it('reports truncation from the cached read', async () => {
    loadCorporationAssets.mockResolvedValue({ cached: { data: [], truncated: true } });

    const result = await loadCorpOwnedStockSource(91, 500);

    expect(result?.truncated).toBe(true);
  });

  it('returns null when nothing could be read at all', async () => {
    loadCorporationAssets.mockResolvedValue({ cached: null, needsReauth: true });

    expect(await loadCorpOwnedStockSource(91, 500)).toBeNull();
  });
});

describe('useCorpOwnedStockSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeCorporationId = CORPORATION_ID;
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    usePublicInfo.setState({
      byCharacterId: { [CHARACTER_ID]: { corporationName: 'Acme Corp', allianceName: null } },
      load: vi.fn(),
    });
    useCorpAccess.mockReturnValue(accessOf('ready', { canReadAssets: true }));
    loadCorporationAssets.mockResolvedValue({ cached: { data: [ASSET], truncated: false } });
  });

  it('is unavailable without the canReadAssets capability, even with a known corporation', async () => {
    useCorpAccess.mockReturnValue(accessOf('ready', {}));
    const { result } = renderHook(() => useCorpOwnedStockSource());
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.source).toBeNull();
    expect(loadCorporationAssets).not.toHaveBeenCalled();
  });

  it('fetches and exposes the active corporation as a source once available', async () => {
    const { result } = renderHook(() => useCorpOwnedStockSource());
    await waitFor(() =>
      expect(result.current.source).toEqual({
        characterId: CHARACTER_ID,
        corporationId: CORPORATION_ID,
        assets: [ASSET],
      })
    );
    expect(result.current.corporationName).toBe('Acme Corp');
    expect(result.current.available).toBe(true);
  });

  /**
   * The acceptance criterion this covers: "Switching which character is
   * active while a plan is open re-resolves which corporation's assets are
   * included (or clears them, if the newly active character isn't a
   * Director)" (issue #798).
   */
  it('re-resolves to the new corporation when the active character switches', async () => {
    const { result, rerender } = renderHook(() => useCorpOwnedStockSource());
    await waitFor(() => expect(result.current.corporationId).toBe(CORPORATION_ID));

    const otherAsset = { ...ASSET, item_id: 2, quantity: 77 };
    loadCorporationAssets.mockResolvedValue({ cached: { data: [otherAsset], truncated: false } });
    activeCorporationId = OTHER_CORPORATION_ID;
    usePublicInfo.setState({
      byCharacterId: {
        [CHARACTER_ID]: { corporationName: 'Acme Corp', allianceName: null },
        [OTHER_CHARACTER_ID]: { corporationName: 'Widget Co', allianceName: null },
      },
    });
    useActiveCharacter.setState({ activeCharacterId: OTHER_CHARACTER_ID, hydrated: true });
    rerender();

    await waitFor(() => expect(result.current.corporationId).toBe(OTHER_CORPORATION_ID));
    await waitFor(() =>
      expect(result.current.source).toEqual({
        characterId: OTHER_CHARACTER_ID,
        corporationId: OTHER_CORPORATION_ID,
        assets: [otherAsset],
      })
    );
    expect(result.current.corporationName).toBe('Widget Co');
  });

  it('clears the source when the newly active character lacks the capability', async () => {
    const { result, rerender } = renderHook(() => useCorpOwnedStockSource());
    await waitFor(() => expect(result.current.available).toBe(true));

    useCorpAccess.mockReturnValue(accessOf('ready', {}));
    useActiveCharacter.setState({ activeCharacterId: OTHER_CHARACTER_ID, hydrated: true });
    rerender();

    expect(result.current.available).toBe(false);
    expect(result.current.source).toBeNull();
  });

  it('never surfaces a stale result from the previous character while the new fetch is in flight', async () => {
    const { result, rerender } = renderHook(() => useCorpOwnedStockSource());
    await waitFor(() => expect(result.current.source).not.toBeNull());

    let resolveNext: (value: unknown) => void = () => {};
    loadCorporationAssets.mockReturnValue(
      new Promise((resolve) => {
        resolveNext = resolve;
      })
    );
    activeCorporationId = OTHER_CORPORATION_ID;
    useActiveCharacter.setState({ activeCharacterId: OTHER_CHARACTER_ID, hydrated: true });
    rerender();

    // The old character's source must not still be reported for the new one.
    expect(result.current.source).toBeNull();

    resolveNext({ cached: { data: [ASSET], truncated: false } });
    await waitFor(() => expect(result.current.source).not.toBeNull());
  });
});
