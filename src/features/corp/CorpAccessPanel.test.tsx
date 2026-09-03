import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { StatusResult } from '@/esi/cache';
import type { CharacterCorporationRoles } from '@/esi/endpoints';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { beginEveLogin } from '@/app/loginFlow';
import { scopesForGroup } from '@/esi/scopes';
import { loadCharacterRoles } from './roles';
import { CorpAccessPanel } from './CorpAccessPanel';

vi.mock('./roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./roles')>()),
  loadCharacterRoles: vi.fn(),
}));
vi.mock('@/app/useGrantedScopes', () => ({ useGrantedScopes: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const mockedLoadRoles = vi.mocked(loadCharacterRoles);
const mockedGrantedScopes = vi.mocked(useGrantedScopes);
const mockedBeginLogin = vi.mocked(beginEveLogin);

const CHARACTER_ID = 42;
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

/**
 * AC 4: all four `useCorpAccess()` states, told apart on sight. This row is the
 * only surface that renders for an ungranted Character — everything else in the
 * corp section hides — so "correct" here means the user can tell which of the
 * four they are in, and whether there is anything they can do about it.
 */
describe('CorpAccessPanel — the four states', () => {
  it('unknown: says it is still reading, and offers no Grant button', () => {
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    render(<CorpAccessPanel />);
    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /grant access/i })).not.toBeInTheDocument();
  });

  it('none: offers NO Grant button, because granting would unlock nothing', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo([]));
    render(<CorpAccessPanel />);
    await waitFor(() => expect(screen.getByText('Not applicable')).toBeInTheDocument());
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /grant access/i })).not.toBeInTheDocument();
  });

  it('roles-without-grant: names the roles held and offers the Grant button', async () => {
    mockedGrantedScopes.mockReturnValue([]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Junior_Accountant']));
    render(<CorpAccessPanel />);
    await waitFor(() => expect(screen.getByText('Not granted')).toBeInTheDocument());
    // Underscores unwrapped: ESI's enum spelling, made readable (roles.ts).
    expect(screen.getByText('Junior Accountant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /grant access/i })).toBeInTheDocument();
  });

  it('ready: reports the grant and has nothing left to ask for', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    render(<CorpAccessPanel />);
    await waitFor(() => expect(screen.getByText('Granted')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /grant access/i })).not.toBeInTheDocument();
  });

  /**
   * `none` is "resolved, and holds no capability" — which a member with only
   * office-scoped roles still is. Claiming they hold no role at all would be a
   * different, and false, statement.
   */
  it('names roles that open nothing, rather than claiming there are none', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Hangar_Take_1']));
    render(<CorpAccessPanel />);
    await waitFor(() => expect(screen.getByText('Not applicable')).toBeInTheDocument());
    expect(screen.getByText('Hangar Take 1')).toBeInTheDocument();
  });
});

describe('CorpAccessPanel — the Grant button', () => {
  it('asks for the corp group AS this Character, so the existing grant is not narrowed', async () => {
    mockedGrantedScopes.mockReturnValue([]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    render(<CorpAccessPanel />);
    await screen.findByRole('button', { name: /grant access/i });

    await userEvent.click(screen.getByRole('button', { name: /grant access/i }));

    expect(mockedBeginLogin).toHaveBeenCalledWith({
      characterId: CHARACTER_ID,
      groups: ['corp'],
    });
  });
});

describe('CorpAccessPanel — no active Character', () => {
  it('says so instead of rendering an empty row, and asks ESI for nothing', () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
    render(<CorpAccessPanel />);
    expect(screen.getByText(/select a character/i)).toBeInTheDocument();
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });
});
