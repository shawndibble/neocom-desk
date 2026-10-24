import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import type { StatusResult } from '@/esi/cache';
import type { CharacterCorporationRoles } from '@/esi/endpoints';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { beginEveLogin } from '@/app/loginFlow';
import { ESI_REGISTRY, PERMISSIONS, SCOPE_GROUPS } from '@/esi/registry';
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

function renderPanel(url = '/settings/permissions') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PermissionsPanel />
    </MemoryRouter>
  );
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
    renderPanel();
    const link = screen.getByRole('link', { name: /^EVE's own site/ });
    expect(link).toHaveAttribute('href', AUTHORIZED_APPS_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('PermissionsPanel — arriving from Grant missing Permissions', () => {
  it('flashes the Grant button of each flagged Permission and no other', () => {
    mockedGrantedScopes.mockReturnValue([...CORE_GRANT]);
    renderPanel('/settings/permissions?grant=openWindow');
    expect(within(row('Open in EVE')).getByRole('button', { name: /^Grant/ })).toHaveClass(
      'grant-flash'
    );
    expect(
      within(row('Structure markets')).getByRole('button', { name: /^Grant/ })
    ).not.toHaveClass('grant-flash');
  });

  it('flashes nothing without the parameter, or for a Permission already granted', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES]);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    renderPanel('/settings/permissions?grant=wallet,nonsense');
    expect(document.querySelector('.grant-flash')).toBeNull();
  });
});

describe('PermissionsPanel — every Permission', () => {
  it('lists each Permission with its label and caption', () => {
    renderPanel();
    expect(screen.getAllByRole('listitem')).toHaveLength(SCOPE_GROUPS.length);
    expect(within(row('Mail')).getByText(/reading, organizing and sending/i)).toBeInTheDocument();
    expect(within(row('Structure markets')).getByText(/player structure/i)).toBeInTheDocument();
  });

  it('marks what the Base Grant holds as granted and the opt-ins as missing', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES]);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(within(row('Wallet')).getByText('Granted')).toBeInTheDocument();
    expect(within(row('Wallet')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('Structure markets')).getByText('Not granted')).toBeInTheDocument();
    expect(
      within(row('Structure markets')).getByRole('button', { name: 'Grant Structure markets' })
    ).toBeInTheDocument();
  });

  it('lists Not granted rows before Granted ones, each half in catalogue order', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES]);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    renderPanel();
    const items = screen.getAllByRole('listitem');
    const states = items.map((li) => (within(li).queryByText('Not granted') ? 'missing' : 'other'));
    const firstOther = states.indexOf('other');
    expect(firstOther).toBeGreaterThan(0);
    expect(states.slice(0, firstOther)).not.toContain('other');
    expect(states.slice(firstOther)).not.toContain('missing');
    expect(items).toHaveLength(SCOPE_GROUPS.length);
  });

  it('keeps catalogue order when nothing is missing', () => {
    mockedGrantedScopes.mockReturnValue(undefined);
    renderPanel();
    const shown = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('div > div')?.firstChild?.textContent);
    const catalogue = SCOPE_GROUPS.map((group) => i18n.t(PERMISSIONS[group].labelKey)).filter(
      (label) => shown.includes(label)
    );
    expect(shown).toEqual(catalogue);
  });

  it('offers Grant on every Permission a Core-only Character is missing', () => {
    mockedGrantedScopes.mockReturnValue([...CORE_GRANT]);
    renderPanel();
    expect(screen.getAllByRole('button', { name: /^grant /i })).toHaveLength(SCOPE_GROUPS.length);
  });

  it('explains in a tooltip what the Corporation, Corporation projects and Killmails rows unlock', () => {
    mockedGrantedScopes.mockReturnValue([...CORE_GRANT]);
    renderPanel();
    expect(
      within(row('Killmails')).getByRole('button', { name: 'About Killmails' })
    ).toBeInTheDocument();
    expect(
      within(row('Corporation projects')).getByRole('button', {
        name: 'About Corporation projects',
      })
    ).toBeInTheDocument();
    expect(within(row('Wallet')).queryByRole('button', { name: /^About/ })).toBeNull();
  });

  it('shows checking, not missing, while the grant is still unknown', () => {
    mockedGrantedScopes.mockReturnValue(undefined);
    renderPanel();
    expect(screen.queryByRole('button', { name: /^grant/i })).not.toBeInTheDocument();
    expect(within(row('Wallet')).getByText('Checking…')).toBeInTheDocument();
  });

  it('Grant asks for just that Permission, as this Character', async () => {
    mockedGrantedScopes.mockReturnValue([...CORE_GRANT]);
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Grant Mail' }));

    expect(mockedGrant).toHaveBeenCalledWith({ characterId: CHARACTER_ID, groups: ['mail'] });
  });

  it('has no Remove action anywhere', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES, ...ALL_CORP_SCOPES]);
    renderPanel();
    expect(screen.queryByRole('button', { name: /remove|revoke/i })).not.toBeInTheDocument();
  });
});

describe('PermissionsPanel — granting several at once', () => {
  beforeEach(() => mockedGrantedScopes.mockReturnValue([...CORE_GRANT]));

  it('offers a checkbox only on rows that are missing', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES]);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(within(row('Wallet')).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      within(row('Structure markets')).getByRole('checkbox', { name: 'Select Structure markets' })
    ).toBeInTheDocument();
  });

  it('hides the bulk button until something is ticked', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /^grant selected/i })).not.toBeInTheDocument();
  });

  it('sends every ticked Permission in one login', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mail' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Wallet' }));

    await userEvent.click(screen.getByRole('button', { name: 'Grant selected (2)' }));

    expect(mockedGrant).toHaveBeenCalledTimes(1);
    const call = mockedGrant.mock.calls[0]![0]!;
    expect(call.characterId).toBe(CHARACTER_ID);
    expect([...call.groups!].sort()).toEqual(['mail', 'wallet']);
  });

  it('unticking removes it from the request', async () => {
    renderPanel();
    const mail = screen.getByRole('checkbox', { name: 'Select Mail' });
    await userEvent.click(mail);
    await userEvent.click(mail);
    expect(screen.queryByRole('button', { name: /^grant selected/i })).not.toBeInTheDocument();
  });

  it('drops the ticks when the active Character changes', async () => {
    const { rerender } = renderPanel();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mail' }));
    expect(screen.getByRole('button', { name: 'Grant selected (1)' })).toBeInTheDocument();

    act(() => useActiveCharacter.setState({ activeCharacterId: 43 }));
    rerender(
      <MemoryRouter initialEntries={['/settings/permissions']}>
        <PermissionsPanel />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /^grant selected/i })).not.toBeInTheDocument();
  });

  it('Select all ticks every missing row; Select none clears them', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(
      screen.getByRole('button', { name: `Grant selected (${SCOPE_GROUPS.length})` })
    ).toBeInTheDocument();
    const selectNone = screen.getByRole('button', { name: 'Select none' });
    await userEvent.click(selectNone);
    expect(screen.queryByRole('button', { name: /^grant selected/i })).not.toBeInTheDocument();
    // Nothing left to clear, yet the pressed button keeps focus (issue #3365).
    expect(selectNone).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(selectNone);
  });

  it('shows no selection controls when nothing is missing', () => {
    mockedGrantedScopes.mockReturnValue(
      SCOPE_GROUPS.flatMap((group) => [...scopesForGroup(group)])
    );
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();
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
    renderPanel();
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(SCOPE_GROUPS.length - 1)
    );
    expect(screen.queryByText('Corporation', { selector: 'div' })).not.toBeInTheDocument();
  });

  it('roles-without-grant: names the roles held and offers Grant', async () => {
    mockedGrantedScopes.mockReturnValue([ROLES_SCOPE]);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Junior_Accountant']));
    renderPanel();
    await waitFor(() =>
      expect(within(row('Corporation')).getByText(/Junior Accountant/)).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole('button', { name: 'Grant Corporation' }));

    expect(mockedGrant).toHaveBeenCalledWith({ characterId: CHARACTER_ID, groups: ['corp'] });
  });

  it('not-granted: offers Grant, since roles are unknowable until then', () => {
    mockedGrantedScopes.mockReturnValue([...SCOPES]);
    renderPanel();
    expect(within(row('Corporation')).getByText(/roles show once granted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant Corporation' })).toBeInTheDocument();
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });

  it('unknown: checking, with no Grant button', () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(within(row('Corporation')).getByText('Checking…')).toBeInTheDocument();
    expect(
      within(row('Corporation')).queryByRole('button', { name: /Grant/ })
    ).not.toBeInTheDocument();
  });

  it('ready: granted, nothing left to ask for', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
    renderPanel();
    await waitFor(() =>
      expect(within(row('Corporation')).getByText('Granted')).toBeInTheDocument()
    );
    expect(
      within(row('Corporation')).queryByRole('button', { name: /Grant/ })
    ).not.toBeInTheDocument();
  });
});

describe('PermissionsPanel — no active Character', () => {
  it('says so instead of an empty list, and asks ESI for nothing', () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
    renderPanel();
    expect(screen.getByText(/select a character/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(mockedLoadRoles).not.toHaveBeenCalled();
  });
});
