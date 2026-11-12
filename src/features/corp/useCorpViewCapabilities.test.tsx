import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { corpCapabilities } from '@/engine/corpRoles';
import { useCorpAccess } from './useCorpAccess';
import { loadAccountCorpAccess, type CorpCapability } from './corpReadAccess';
import { useCorpViewCapabilities } from './useCorpViewCapabilities';

vi.mock('./useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mock('./corpReadAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./corpReadAccess')>()),
  loadAccountCorpAccess: vi.fn(async () => []),
}));

function moonsFor(roles: string[], state: 'ready' | 'none' = 'ready') {
  vi.mocked(useCorpAccess).mockReturnValue({
    state,
    roles,
    capabilities: corpCapabilities(roles),
    missingScopes: [],
    readFailed: false,
    retry: () => {},
  });
  return renderHook(() => useCorpViewCapabilities()).result.current.canReadMiningLedger;
}

describe('useCorpViewCapabilities Moons entry', () => {
  it('is offered to every D8 viewer, Junior_Accountant included', () => {
    expect(moonsFor(['Accountant'])).toBe(true);
    expect(moonsFor(['Director'])).toBe(true);
    expect(moonsFor(['Junior_Accountant'])).toBe(true);
  });

  it('is hidden from other roles and from a Character without corp access', () => {
    expect(moonsFor(['Station_Manager'])).toBe(false);
    expect(moonsFor(['Junior_Accountant'], 'none')).toBe(false);
  });
});

describe('useCorpViewCapabilities Structures entry', () => {
  function activeWith(roles: string[]) {
    vi.mocked(useCorpAccess).mockReturnValue({
      state: 'ready',
      roles,
      capabilities: corpCapabilities(roles),
      missingScopes: [],
      readFailed: false,
      retry: () => {},
    });
  }
  const reader = (capability: CorpCapability) => ({
    characterId: 7,
    access: { corporationId: 99, can: (wanted: CorpCapability) => wanted === capability },
  });

  it('is offered when another Character of the account reads a corporation’s structures', async () => {
    activeWith([]);
    vi.mocked(loadAccountCorpAccess).mockResolvedValueOnce([reader('canReadStructures')]);
    const { result } = renderHook(() => useCorpViewCapabilities());
    await waitFor(() => expect(result.current.canReadStructures).toBe(true));
  });

  it('is hidden when no Character of the account can read structures', async () => {
    activeWith([]);
    vi.mocked(loadAccountCorpAccess).mockResolvedValueOnce([reader('canReadWallet')]);
    const { result } = renderHook(() => useCorpViewCapabilities());
    await waitFor(() => expect(loadAccountCorpAccess).toHaveBeenCalled());
    expect(result.current.canReadStructures).toBe(false);
  });
});
