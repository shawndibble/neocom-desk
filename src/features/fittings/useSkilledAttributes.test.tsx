import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { PilotProfileState } from './fittingPilotProfile';
import { useSkilledAttributes } from './useSkilledAttributes';

const ZEALOT = 12003;
const ROCK = 34;
const PROFILE = { skillLevels: new Map([[3394, 5]]), implantTypeIds: [], boosterTypeIds: [] };

const pilot = vi.hoisted(() => ({
  state: null as unknown as PilotProfileState,
}));
const engine = vi.hoisted(() => ({ cached: false, online: true }));

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({ 12003: { groupID: 358 }, 34: { groupID: 18 } })),
  loadGroupCategories: vi.fn(async () => ({ '358': 6, '18': 4 })),
  loadFittingSlots: vi.fn(async () => ({})),
}));
vi.mock('./fittingPilotProfile', () => ({ usePilotProfile: () => pilot.state }));
vi.mock('./useDogmaEngineStatus', () => ({ useDogmaEngineStatus: () => 'idle' }));
vi.mock('./dogmaEngineAssets', () => ({ dogmaEngineAssetsCached: async () => engine.cached }));
vi.mock('@/stores/network', () => ({ useOnline: () => engine.online }));
const skilledAttributes = vi.hoisted(() =>
  vi.fn(async () => new Map([[265, 2812.5]]) as Map<number, number>)
);
vi.mock('./dogmaFittingEngine', () => ({ skilledAttributes }));

beforeEach(() => {
  skilledAttributes.mockClear();
  engine.cached = false;
  engine.online = true;
  pilot.state = { profile: PROFILE, failed: false, skillsKnown: true, retry: () => {} };
  useActiveCharacter.setState({ activeCharacterId: 90000001 });
});

describe('useSkilledAttributes', () => {
  it('works the pilot’s values out by itself when the engine is cached', async () => {
    engine.cached = true;
    const { result } = renderHook(() => useSkilledAttributes(ZEALOT));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.status === 'ready' && result.current.values.get(265)).toBe(2812.5);
    expect(skilledAttributes).toHaveBeenCalledWith({ kind: 'ship', typeId: ZEALOT }, PROFILE);
  });

  it('offers the download when the engine is not cached, and only starts it when asked', async () => {
    const { result } = renderHook(() => useSkilledAttributes(ZEALOT));
    await waitFor(() => expect(result.current.status).toBe('needs-download'));
    expect(skilledAttributes).not.toHaveBeenCalled();
    act(() => {
      if (result.current.status === 'needs-download') result.current.load();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('offers nothing offline with nothing cached', async () => {
    engine.online = false;
    const { result } = renderHook(() => useSkilledAttributes(ZEALOT));
    await waitFor(() => expect(result.current.status).toBe('none'));
  });

  it('shows base values only when the pilot’s skills cannot be read', async () => {
    engine.cached = true;
    pilot.state = { ...pilot.state, skillsKnown: false };
    const { result } = renderHook(() => useSkilledAttributes(ZEALOT));
    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(skilledAttributes).not.toHaveBeenCalled();
  });

  it('has nothing for an item that is neither a ship nor a module', async () => {
    engine.cached = true;
    const { result } = renderHook(() => useSkilledAttributes(ROCK));
    await waitFor(() => expect(result.current.status).toBe('none'));
  });
});
