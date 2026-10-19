import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { corpCapabilities } from '@/engine/corpRoles';
import { useCorpAccess } from './useCorpAccess';
import { useCorpViewCapabilities } from './useCorpViewCapabilities';

vi.mock('./useCorpAccess', () => ({ useCorpAccess: vi.fn() }));

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
