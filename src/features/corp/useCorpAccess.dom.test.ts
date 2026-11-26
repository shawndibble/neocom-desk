import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { StatusResult } from '@/esi/cache';
import type { CharacterCorporationRoles } from '@/esi/endpoints';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { ESI_REGISTRY } from '@/esi/registry';
import { scopesForGroup, SCOPES } from '@/esi/scopes';
import { CORP_SCOPES_FOR_CAPABILITY } from './corpScopes';
import { loadCharacterRoles } from './roles';
import { useCorpAccess } from './useCorpAccess';
import { deferred } from '@/test/deferred';

vi.mock('./roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./roles')>()),
  loadCharacterRoles: vi.fn(),
}));
vi.mock('@/app/useGrantedScopes', () => ({ useGrantedScopes: vi.fn() }));

const mockedLoadRoles = vi.mocked(loadCharacterRoles);
const mockedGrantedScopes = vi.mocked(useGrantedScopes);

const CHARACTER_ID = 42;
const ALL_CORP_SCOPES = [...scopesForGroup('corp')];
const ROLES_SCOPE = ESI_REGISTRY.getCharacterRoles.scope;

function rolesResolvingTo(roles: readonly string[]): StatusResult<CharacterCorporationRoles> {
  return {
    cached: {
      data: { roles: [...roles] },
      fetchedAt: new Date(0),
      fromCache: false,
      truncated: false,
    },
    needsReauth: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
  mockedGrantedScopes.mockReturnValue([]);
  mockedLoadRoles.mockResolvedValue(rolesResolvingTo([]));
});

describe('useCorpAccess — unknown', () => {
  it('is unknown on the first frames of a cold load, and renders as nothing', () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('unknown');
    expect(result.current.missingScopes).toEqual([]);
  });

  it('stays unknown while the granted scopes are unresolved, then reads roles once they resolve with the roles scope', async () => {
    mockedGrantedScopes.mockReturnValue(undefined);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    const { result, rerender } = renderHook(() => useCorpAccess());

    expect(result.current.state).toBe('unknown');
    expect(mockedLoadRoles).not.toHaveBeenCalled();

    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    rerender();
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(mockedLoadRoles).toHaveBeenCalledTimes(1);
  });

  it('is unknown when no Character is active yet, and asks ESI for nothing', () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
    mockedGrantedScopes.mockReturnValue(undefined);
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('unknown');
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });
});

describe('useCorpAccess — not-granted', () => {
  it('is not-granted when the roles scope itself has not been granted, and asks ESI for nothing', () => {
    mockedGrantedScopes.mockReturnValue([]);
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('not-granted');
    expect(result.current.roles).toEqual([]);
    expect(result.current.missingScopes).toEqual([]);
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });

  it('is not-granted even when other corp scopes are held, as long as the roles scope itself is missing', () => {
    mockedGrantedScopes.mockReturnValue(['esi-corporations.read_structures.v1']);
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('not-granted');
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });

  it('moves off not-granted once the roles scope is granted, without a remount', async () => {
    mockedGrantedScopes.mockReturnValue([]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    const { result, rerender } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('not-granted');

    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    rerender();
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });
});

describe('useCorpAccess — none', () => {
  it('is none for a character holding the whole Base Grant but no corp role, and renders nothing', async () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo([]));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('none'));
    expect(result.current.capabilities.canReadWallet).toBe(false);
    expect(result.current.missingScopes).toEqual([]);
  });
});

describe('useCorpAccess — a roles read that could not complete', () => {
  it('stays unknown when the roles read fails outright, rather than claiming none', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    const read = deferred<Awaited<ReturnType<typeof loadCharacterRoles>>>();
    mockedLoadRoles.mockReturnValue(read.promise);
    const { result } = renderHook(() => useCorpAccess());
    await act(async () => read.resolve({ cached: null, needsReauth: true }));
    expect(result.current.state).toBe('unknown');
  });

  it('stays unknown when the roles read rejects', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.readFailed).toBe(true));
    expect(result.current.state).toBe('unknown');
  });

  it('reports the failure, apart from a read that is still loading', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.readFailed).toBe(false);
    await waitFor(() => expect(result.current.readFailed).toBe(true));
    expect(result.current.state).toBe('unknown');
  });

  it('does not offer a retry when the login itself was refused', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    const read = deferred<Awaited<ReturnType<typeof loadCharacterRoles>>>();
    mockedLoadRoles.mockReturnValue(read.promise);
    const { result } = renderHook(() => useCorpAccess());
    await act(async () => read.resolve({ cached: null, needsReauth: true }));
    expect(result.current.state).toBe('unknown');
    expect(result.current.readFailed).toBe(false);
  });

  it('reads again on retry, and resolves once the read succeeds', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles
      .mockResolvedValueOnce({ cached: null, needsReauth: false })
      .mockResolvedValue(rolesResolvingTo(['Director']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.readFailed).toBe(true));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.readFailed).toBe(false);
  });

  it('reads again by itself when the connection returns', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(rolesResolvingTo(['Director']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.readFailed).toBe(true));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });
});

describe('useCorpAccess — roles-without-grant', () => {
  it('reports the scopes a capable character has not granted, and still renders nothing', async () => {
    mockedGrantedScopes.mockReturnValue([ROLES_SCOPE]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Station_Manager']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('roles-without-grant'));
    expect(result.current.capabilities.canReadStructures).toBe(true);
    expect(result.current.missingScopes).toEqual([
      'esi-corporations.read_structures.v1',
      'esi-industry.read_corporation_mining.v1',
      'esi-contracts.read_corporation_contracts.v1',
      'esi-structures.read_corporation.v1',
    ]);
  });

  it('lands a Trader-only Character on roles-without-grant so it is asked to grant', async () => {
    mockedGrantedScopes.mockReturnValue([ROLES_SCOPE]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Trader']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('roles-without-grant'));
    expect(result.current.missingScopes).toContain('esi-markets.read_corporation_orders.v1');
  });

  it('does not ask a Factory_Manager for scopes only an Accountant could use', async () => {
    mockedGrantedScopes.mockReturnValue([ROLES_SCOPE]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Factory_Manager']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('roles-without-grant'));
    expect(result.current.missingScopes).toEqual([
      'esi-industry.read_corporation_jobs.v1',
      'esi-contracts.read_corporation_contracts.v1',
    ]);
  });
});

describe('useCorpAccess — ready', () => {
  it('is ready for a Director holding every corp scope', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.missingScopes).toEqual([]);
    expect(result.current.capabilities).toEqual({
      canReadWallet: true,
      canReadStructures: true,
      canReadMoonExtractions: true,
      canReadMiningLedger: true,
      canReadMembers: true,
      canReadIndustry: true,
      canReadAssets: true,
      canReadBlueprints: true,
      canReadStarbases: true,
      canReadCustomsOffices: true,
      canReadRoleAudit: true,
      canReadContracts: true,
      canReadOrders: true,
      canReadDivisions: true,
      canReadSkyhooks: true,
      canManageSrp: true,
      canConfigureSrp: true,
      canVet: true,
      canConfigureVetting: true,
      canViewTaxBook: true,
    });
  });

  it('is ready for a partial role holding only the scopes that role needs', async () => {
    mockedGrantedScopes.mockReturnValue([...CORP_SCOPES_FOR_CAPABILITY.canReadWallet, ROLES_SCOPE]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Junior_Accountant']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.capabilities.canReadWallet).toBe(true);
    expect(result.current.capabilities.canReadMembers).toBe(false);
  });

  it('stays ready for an Accountant missing only the mining-ledger scope, and asks for it', async () => {
    mockedGrantedScopes.mockReturnValue([...CORP_SCOPES_FOR_CAPABILITY.canReadWallet, ROLES_SCOPE]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Accountant']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.capabilities.canReadWallet).toBe(true);
    expect(result.current.capabilities.canReadMiningLedger).toBe(false);
    expect(result.current.missingScopes).toEqual([
      'esi-industry.read_corporation_mining.v1',
      'esi-contracts.read_corporation_contracts.v1',
      'esi-markets.read_corporation_orders.v1',
    ]);
  });

  it('opens the mining ledger to an Accountant once the mining scope is granted', async () => {
    mockedGrantedScopes.mockReturnValue([
      ...CORP_SCOPES_FOR_CAPABILITY.canReadWallet,
      ...CORP_SCOPES_FOR_CAPABILITY.canReadMiningLedger,
      ...CORP_SCOPES_FOR_CAPABILITY.canReadContracts,
      ...CORP_SCOPES_FOR_CAPABILITY.canReadOrders,
      ROLES_SCOPE,
    ]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Accountant']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.capabilities.canReadMiningLedger).toBe(true);
    expect(result.current.missingScopes).toEqual([]);
  });
});

describe('useCorpAccess — switching Character', () => {
  it("does not carry one Character's roles over to the next", async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    const { result, rerender } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    useActiveCharacter.setState({ activeCharacterId: 77, hydrated: true });
    rerender();
    expect(result.current.state).toBe('unknown');
  });

  it('answers per Character when one has granted corp access and the other has not', async () => {
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    const { result, rerender } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    mockedGrantedScopes.mockReturnValue([ROLES_SCOPE]);
    useActiveCharacter.setState({ activeCharacterId: 77, hydrated: true });
    rerender();

    await waitFor(() => expect(result.current.state).toBe('roles-without-grant'));
    expect(result.current.missingScopes.length).toBeGreaterThan(0);
  });

  it('re-reads roles for the newly active Character', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo([]));
    const { rerender } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(mockedLoadRoles).toHaveBeenCalledWith(CHARACTER_ID));

    useActiveCharacter.setState({ activeCharacterId: 77, hydrated: true });
    rerender();
    await waitFor(() => expect(mockedLoadRoles).toHaveBeenCalledWith(77));
  });
});

describe('useCorpAccess — the roles held', () => {
  it('reports the corporation-wide roles once they have resolved', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Station_Manager', 'Hangar_Take_1']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.roles).toEqual(['Station_Manager', 'Hangar_Take_1']);
  });

  it('reports no roles while the state is still unknown', () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('unknown');
    expect(result.current.roles).toEqual([]);
  });

  it('reports roles that grant no capability, alongside the none state', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Hangar_Take_1']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('none'));
    expect(result.current.roles).toEqual(['Hangar_Take_1']);
  });
});
