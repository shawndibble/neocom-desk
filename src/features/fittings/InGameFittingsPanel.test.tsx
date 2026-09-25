import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { InGameFittingsPanel } from './InGameFittingsPanel';
import type { CharacterFitting } from '@/esi/endpoints';

const useEndpointsGrantedMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/useGrantedScopes', () => ({ useEndpointsGranted: useEndpointsGrantedMock }));

const loginMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: loginMock }));

const loadInGameFittingsMock = vi.hoisted(() => vi.fn());
vi.mock('./inGameFittings', () => ({ loadInGameFittings: loadInGameFittingsMock }));

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({ '587': { name: 'Rifter' } })),
}));

function cachedFitting(overrides: Partial<CharacterFitting> = {}): CharacterFitting {
  return {
    fitting_id: 1,
    name: 'PvP Rifter',
    description: '',
    ship_type_id: 587,
    items: [{ flag: 'HiSlot0', quantity: 1, type_id: 484 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InGameFittingsPanel', () => {
  it('shows a re-auth banner and never fetches when the fittings scope is missing', async () => {
    useEndpointsGrantedMock.mockReturnValue(false);
    render(<InGameFittingsPanel characterId={1} onOpen={vi.fn()} />);

    expect(await screen.findByText('Allow fittings access')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log in again with EVE Online' }));
    expect(loginMock).toHaveBeenCalledWith({ characterId: 1, groups: ['fittings'] });
    // Never calls ESI for a Character it already knows lacks the scope
    // (avoids tripping the app-wide 403 auth-failure notice).
    expect(loadInGameFittingsMock).not.toHaveBeenCalled();
  });

  it('lists fittings grouped by hull, and Open loads the mapped Fitting', async () => {
    useEndpointsGrantedMock.mockReturnValue(true);
    loadInGameFittingsMock.mockResolvedValue({
      cached: {
        data: [cachedFitting()],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const onOpen = vi.fn();
    render(<InGameFittingsPanel characterId={1} onOpen={onOpen} />);

    expect(await screen.findByText('Rifter')).toBeInTheDocument();
    expect(screen.getByText('PvP Rifter')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        fitting: expect.objectContaining({
          name: 'PvP Rifter',
          shipTypeId: 587,
          modules: [{ slot: 'high', slotIndex: 0, typeId: 484, state: 'active' }],
        }),
        unresolved: [],
      })
    );
  });

  it("opens what it can, handing the items it can't map (fighter bay, service slot) on as the Load's warnings", async () => {
    useEndpointsGrantedMock.mockReturnValue(true);
    loadInGameFittingsMock.mockResolvedValue({
      cached: {
        data: [
          cachedFitting({
            items: [
              { flag: 'HiSlot0', quantity: 1, type_id: 484 },
              { flag: 'FighterBay', quantity: 1, type_id: 99 },
            ],
          }),
        ],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const onOpen = vi.fn();
    render(<InGameFittingsPanel characterId={1} onOpen={onOpen} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Open' }));

    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        fitting: expect.objectContaining({
          modules: [{ slot: 'high', slotIndex: 0, typeId: 484, state: 'active' }],
        }),
        unresolved: [{ text: 'FighterBay', reason: 'unsupported slot' }],
      })
    );
  });

  it('shows an empty state when the Character has no in-game Fittings', async () => {
    useEndpointsGrantedMock.mockReturnValue(true);
    loadInGameFittingsMock.mockResolvedValue({
      cached: { data: [], fetchedAt: new Date(), fromCache: false, truncated: false },
      needsReauth: false,
    });
    render(<InGameFittingsPanel characterId={1} onOpen={vi.fn()} />);

    expect(await screen.findByText('No in-game Fittings')).toBeInTheDocument();
  });
});
