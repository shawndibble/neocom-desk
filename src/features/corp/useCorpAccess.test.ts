import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { StatusResult } from '@/esi/cache';
import type { CharacterCorporationRoles } from '@/esi/endpoints';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { scopesForGroup } from '@/esi/scopes';
import { CORP_SCOPES_FOR_CAPABILITY } from './corpScopes';
import { loadCharacterRoles } from './roles';
import { useCorpAccess } from './useCorpAccess';

vi.mock('./roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./roles')>()),
  loadCharacterRoles: vi.fn(),
}));
vi.mock('@/app/useGrantedScopes', () => ({ useGrantedScopes: vi.fn() }));

const mockedLoadRoles = vi.mocked(loadCharacterRoles);
const mockedGrantedScopes = vi.mocked(useGrantedScopes);

const CHARACTER_ID = 42;
/**
 * Derived, not listed: this stands for "the Character granted corp access",
 * and the Grant button asks for the whole group. A hand-written copy went
 * stale the moment a capability grew a second scope requirement.
 */
const ALL_CORP_SCOPES = [...scopesForGroup('corp')];

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
  /**
   * The rule this ticket establishes: `unknown` renders as nothing, never a
   * placeholder. A nav item that flickers into existence on load is worse than
   * one that appears a beat late — so the first frames of a cold load must
   * stay `unknown`, which renders as nothing, exactly like `none`.
   */
  it('is unknown on the first frames of a cold load, and renders as nothing', () => {
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('unknown');
    expect(result.current.missingScopes).toEqual([]);
  });

  /**
   * The cell that keeps the two "missing" definitions in step: roles have
   * resolved, but `useGrantedScopes()` has not (it answers `undefined`, not
   * `[]`, while unknown). Answering `roles-without-grant` here would offer a
   * re-auth prompt to a character who may already hold every scope.
   */
  it('stays unknown while the granted scopes are still unresolved, even once roles have loaded', async () => {
    mockedGrantedScopes.mockReturnValue(undefined);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    const { result, rerender } = renderHook(() => useCorpAccess());

    // Flush the roles read, so the assertion below is about the *scopes* being
    // unresolved and cannot pass merely because roles had not landed yet.
    await act(async () => {});
    expect(result.current.state).toBe('unknown');

    // Proof the roles snapshot really was in place above: resolving only the
    // scopes flips the state synchronously, with no second roles read.
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    rerender();
    expect(result.current.state).toBe('ready');
    expect(mockedLoadRoles).toHaveBeenCalledTimes(1);
  });

  it('is unknown when no Character is active yet, and asks ESI for nothing', () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('unknown');
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });
});

describe('useCorpAccess — none', () => {
  it('is none for a character holding no corp role, and renders nothing', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo([]));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('none'));
    expect(result.current.capabilities.canReadWallet).toBe(false);
    expect(result.current.missingScopes).toEqual([]);
  });
});

/**
 * There is no error member in the contract, and a failed read must not be
 * mistaken for a resolved one: `none` claims the Character holds no corp role,
 * which a read that never completed is no evidence for. It stays `unknown` —
 * identical on screen, but not a lie, and not a state a Director who happened
 * to cold-start offline is pinned to for the session.
 */
describe('useCorpAccess — a roles read that could not complete', () => {
  it('stays unknown when the roles read fails outright, rather than claiming none', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue({ cached: null, needsReauth: true });
    const { result } = renderHook(() => useCorpAccess());
    await act(async () => {});
    expect(result.current.state).toBe('unknown');
  });

  it('stays unknown when the roles read rejects', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCorpAccess());
    await act(async () => {});
    expect(result.current.state).toBe('unknown');
  });
});

describe('useCorpAccess — roles-without-grant', () => {
  it('reports the scopes a capable character has not granted, and still renders nothing', async () => {
    mockedGrantedScopes.mockReturnValue([]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Station_Manager']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('roles-without-grant'));
    expect(result.current.capabilities.canReadStructures).toBe(true);
    expect(result.current.missingScopes).toEqual(['esi-corporations.read_structures.v1']);
  });

  it('does not ask a Factory_Manager for scopes only an Accountant could use', async () => {
    mockedGrantedScopes.mockReturnValue([]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Factory_Manager']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('roles-without-grant'));
    expect(result.current.missingScopes).toEqual(['esi-industry.read_corporation_jobs.v1']);
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
      canReadMembers: true,
      canReadIndustry: true,
    });
  });

  it('is ready for a partial role holding only the scopes that role needs', async () => {
    // Derived from the capability, not listed: the point is that the *other*
    // capabilities' scopes are absent and it is `ready` anyway — not how many
    // scopes this one happens to need today.
    mockedGrantedScopes.mockReturnValue([...CORP_SCOPES_FOR_CAPABILITY.canReadWallet]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Junior_Accountant']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.capabilities.canReadWallet).toBe(true);
    expect(result.current.capabilities.canReadMembers).toBe(false);
  });
});

describe('useCorpAccess — switching Character', () => {
  /**
   * Roles are per-character. Carrying the previous Character's answer across a
   * switch would render corp UI for an alt who has no roles at all — so the
   * state must fall back to `unknown` until the new read lands.
   */
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

  /**
   * AC 3: two Characters on one device hold different grants, and each renders
   * according to its own. Same roles on both sides, so only the *grant* can
   * move the state — a Director who granted corp access does not lend it to
   * the alt beside them.
   */
  it('answers per Character when one has granted corp access and the other has not', async () => {
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    const { result, rerender } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    // The alt: same roles, no corp grant of its own.
    mockedGrantedScopes.mockReturnValue([]);
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

/**
 * The Settings Corp access row (#295) reports the roles themselves, not just
 * the capabilities they imply: "you hold Station_Manager" is the sentence that
 * explains why only structures are readable, and a capability list cannot say
 * it. Raw ESI strings, for the same reason `corpCapabilities` tolerates
 * unrecognised ones — CCP extends the enum without notice.
 */
describe('useCorpAccess — the roles held', () => {
  it('reports the corporation-wide roles once they have resolved', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Station_Manager', 'Hangar_Take_1']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.roles).toEqual(['Station_Manager', 'Hangar_Take_1']);
  });

  it('reports no roles while the state is still unknown', () => {
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCorpAccess());
    expect(result.current.state).toBe('unknown');
    expect(result.current.roles).toEqual([]);
  });

  /**
   * `none` means "resolved, and holds no capability" — which a member with only
   * office-scoped or cosmetic roles still is. The row says so honestly rather
   * than claiming an empty role list.
   */
  it('reports roles that grant no capability, alongside the none state', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Hangar_Take_1']));
    const { result } = renderHook(() => useCorpAccess());
    await waitFor(() => expect(result.current.state).toBe('none'));
    expect(result.current.roles).toEqual(['Hangar_Take_1']);
  });
});
