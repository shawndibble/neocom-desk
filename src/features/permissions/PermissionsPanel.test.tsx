import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { StatusResult } from '@/esi/cache';
import type { CharacterCorporationRoles } from '@/esi/endpoints';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { beginEveLogin } from '@/app/loginFlow';
import { ESI_REGISTRY, SCOPE_GROUPS } from '@/esi/registry';
import { CORE_GRANT, SCOPES, scopesForGroup } from '@/esi/scopes';
import { loadCharacterRoles } from '@/features/corp/roles';
import { AUTHORIZED_APPS_URL } from '@/lib/links';
import { PermissionsPanel } from './PermissionsPanel';

vi.mock('@/features/corp/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/roles')>()),
  loadCharacterRoles: vi.fn(),
}));
vi.mock('@/app/useGrantedScopes', () => ({ useGrantedScopes: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const mockedLoadRoles = vi.mocked(loadCharacterRoles);
const mockedGrantedScopes = vi.mocked(useGrantedScopes);
const mockedGrant = vi.mocked(beginEveLogin);

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

/** The list item for one Permission, found by its label. */
function row(label: string): HTMLElement {
  return screen.getByText(label, { selector: 'div' }).closest('li')!;
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
  mockedGrantedScopes.mockReturnValue([]);
  mockedLoadRoles.mockResolvedValue(rolesResolvingTo([]));
});

describe('PermissionsPanel — revoking', () => {
  it("links the revoke hint to CCP's authorized-apps page", () => {
    render(<PermissionsPanel />);
    const link = screen.getByRole('link', { name: "EVE's own site" });
    expect(link).toHaveAttribute('href', AUTHORIZED_APPS_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('PermissionsPanel — every Permission', () => {
  it('lists each Permission with its label and caption', () => {
    render(<PermissionsPanel />);
    expect(screen.getAllByRole('listitem')).toHaveLength(SCOPE_GROUPS.length);
    expect(within(row('Mail')).getByText(/reading, organizing and sending/i)).toBeInTheDocument();
    expect(within(row('Structure markets')).getByText(/player structure/i)).toBeInTheDocument();
  });

  it('marks what the Base Grant holds as granted and the opt-ins as missing', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES]);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    render(<PermissionsPanel />);
    expect(within(row('Wallet')).getByText('Granted')).toBeInTheDocument();
    expect(within(row('Wallet')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('Structure markets')).getByText('Not granted')).toBeInTheDocument();
    expect(
      within(row('Structure markets')).getByRole('button', { name: 'Grant Structure markets' })
    ).toBeInTheDocument();
  });

  it('offers Grant on every Permission a Core-only Character is missing', () => {
    mockedGrantedScopes.mockReturnValue([...CORE_GRANT]);
    render(<PermissionsPanel />);
    expect(screen.getAllByRole('button', { name: /^grant /i })).toHaveLength(SCOPE_GROUPS.length);
  });

  it('shows checking, not missing, while the grant is still unknown', () => {
    mockedGrantedScopes.mockReturnValue(undefined);
    render(<PermissionsPanel />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('Wallet')).getByText('Checking…')).toBeInTheDocument();
  });

  it('Grant asks for just that Permission, as this Character', async () => {
    mockedGrantedScopes.mockReturnValue([...CORE_GRANT]);
    render(<PermissionsPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Grant Mail' }));

    expect(mockedGrant).toHaveBeenCalledWith({ characterId: CHARACTER_ID, groups: ['mail'] });
  });

  it('has no Remove action anywhere', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES, ...ALL_CORP_SCOPES]);
    render(<PermissionsPanel />);
    expect(screen.queryByRole('button', { name: /remove|revoke/i })).not.toBeInTheDocument();
  });
});

/**
 * The Corporation row keeps the old Corp access row's role awareness: a line
 * member is never offered a grant that unlocks nothing.
 */
describe('PermissionsPanel — the Corporation row', () => {
  it('none: hidden, because granting would unlock nothing', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Hangar_Take_1']));
    render(<PermissionsPanel />);
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(SCOPE_GROUPS.length - 1)
    );
    expect(screen.queryByText('Corporation', { selector: 'div' })).not.toBeInTheDocument();
  });

  it('roles-without-grant: names the roles held and offers Grant', async () => {
    mockedGrantedScopes.mockReturnValue([ROLES_SCOPE]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Junior_Accountant']));
    render(<PermissionsPanel />);
    await waitFor(() =>
      expect(within(row('Corporation')).getByText(/Junior Accountant/)).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole('button', { name: 'Grant Corporation' }));

    expect(mockedGrant).toHaveBeenCalledWith({ characterId: CHARACTER_ID, groups: ['corp'] });
  });

  it('not-granted: offers Grant, since roles are unknowable until then', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES]);
    render(<PermissionsPanel />);
    expect(within(row('Corporation')).getByText(/roles show once granted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant Corporation' })).toBeInTheDocument();
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });

  it('unknown: checking, with no Grant button', () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    render(<PermissionsPanel />);
    expect(within(row('Corporation')).getByText('Checking…')).toBeInTheDocument();
    expect(within(row('Corporation')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('ready: granted, nothing left to ask for', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    render(<PermissionsPanel />);
    await waitFor(() =>
      expect(within(row('Corporation')).getByText('Granted')).toBeInTheDocument()
    );
    expect(within(row('Corporation')).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PermissionsPanel — no active Character', () => {
  it('says so instead of an empty list, and asks ESI for nothing', () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
    render(<PermissionsPanel />);
    expect(screen.getByText(/select a character/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });
});
