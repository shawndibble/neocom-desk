import { useEffect } from 'react';
import { SearchInput } from '@/components/ui';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useAuthFailure } from '@/stores/authFailure';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import { useCorpAccess, type CorpAccessState } from '@/features/corp/useCorpAccess';
import { DEFAULT_MOBILE_TABS, useMobileTabs } from '@/lib/mobileTabs';
import { KEYBOARD_OVERLAY_ATTRIBUTE } from '@/lib/shortcuts';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import { Layout } from './Layout';
import { useHiddenNav, useRecentNav } from './navPreferences';
import { useUpdateStatus } from './updateAvailable';
import { seedGrant as seedGrantFor } from '@/test/seed';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
const mockedCorpAccess = vi.mocked(useCorpAccess);

function corpAccess(state: CorpAccessState) {
  return {
    state,
    capabilities: NO_CORP_CAPABILITIES,
    missingScopes: [],
    roles: [],
    readFailed: false,
    retry: () => {},
  };
}

const mockSubscribe = vi.fn();
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';
import { stubViewport } from '@/test/viewport';
import { stubAnimate } from '@/test/animate';
vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  subscribeSyncStatus: (listener: (s: unknown) => void) => mockSubscribe(listener),
}));

vi.mock('./routeWarm', () => ({ warmRoute: vi.fn() }));
const mockedWarmRoute = vi.mocked((await import('./routeWarm')).warmRoute);

const mockIsSyncConfigured = vi.fn();
vi.mock('./syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./syncStatus')>()),
  isSyncConfigured: () => mockIsSyncConfigured(),
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/overview" element={<div>page content</div>} />
          <Route path="/wallet" element={<div>wallet page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function CharactersPageStub() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <div>
      <p>characters page</p>
      <p data-testid="characters-page-from">{from ?? ''}</p>
    </div>
  );
}

function renderLayoutWithRoutes(initialEntry = '/overview') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/overview"
            element={
              <div>
                <p>overview page</p>
                <input aria-label="dummy input" />
                <SearchInput aria-label="page search" />
              </div>
            }
          />
          <Route path="/market" element={<div>market page</div>} />
          <Route path="/characters" element={<CharactersPageStub />} />
          <Route path="/settings/*" element={<div>settings page</div>} />
          <Route path="/help/*" element={<div>help page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  mockSubscribe.mockReset().mockImplementation((listener) => {
    listener({ state: 'idle', lastSyncedAt: null, error: null });
    return () => {};
  });
  mockIsSyncConfigured.mockReset();
  useAuthFailure.setState({ failure: null });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  mockedCorpAccess.mockReturnValue(corpAccess('none'));
  await db.tokens.clear();
  await db.characters.clear();
  useMobileTabs.setState({ value: DEFAULT_MOBILE_TABS, hydrated: true });
  useRecentNav.setState({ value: [], hydrated: true });
  useHiddenNav.setState({ value: [], hydrated: true });
  useUpdateStatus.setState({ status: 'unknown', build: null, found: 0 });
});

describe('Layout sync status dot', () => {
  it('is hidden when sync is unconfigured', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();
    for (const region of screen.getAllByRole('status')) expect(region).toBeEmptyDOMElement();
  });

  it('is shown, subscribed to sync status, when sync is configured', () => {
    mockIsSyncConfigured.mockReturnValue(true);
    mockSubscribe.mockImplementation((listener) => {
      listener({ state: 'syncing', lastSyncedAt: null, error: null });
      return () => {};
    });
    renderLayout();
    expect(screen.getByRole('status', { name: 'Syncing…' })).toBeInTheDocument();
  });
});

describe('Layout mobile "More" sheet (UX-REVIEW #4)', () => {
  it('keeps 4 primary tabs + More in the mobile tab bar', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(
      within(mobileNav)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Overview', 'Skills', 'Industry', 'Market']);
    expect(within(mobileNav).getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('opens a dialog listing Wallet, Assets, Mail, Calendar and Contracts (not Orders)', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    const moreButton = within(mobileNav).getByRole('button', { name: 'More' });
    expect(moreButton).toHaveAttribute('aria-expanded', 'false');
    expect(moreButton).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(moreButton);
    expect(moreButton).toHaveAttribute('aria-expanded', 'true');

    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(moreButton.getAttribute('aria-controls')).toBe(sheet.id);
    for (const label of ['Wallet', 'Assets', 'Mail', 'Calendar', 'Contracts']) {
      expect(within(sheet).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(sheet).queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'Clones' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'Employment' })).not.toBeInTheDocument();
  });

  it('orders the sheet to match the desktop rail: PI, Wallet, Assets, Contracts, Mail, Calendar, Contacts', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });

    expect(within(sheet).queryByRole('link', { name: 'Alerts' })).not.toBeInTheDocument();

    const labels = ['PI', 'Wallet', 'Assets', 'Contracts', 'Mail', 'Calendar', 'Contacts'];
    const links = labels.map((label) => within(sheet).getByRole('link', { name: label }));
    for (let i = 1; i < links.length; i++) {
      expect(
        links[i - 1].compareDocumentPosition(links[i]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it('trails with Help, Settings and the active Character (with photo), after the page tiles', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });

    const contacts = within(sheet).getByRole('link', { name: 'Contacts' });
    const settings = await within(sheet).findByRole('link', { name: 'Settings' });
    const help = within(sheet).getByRole('link', { name: 'Help & FAQ' });
    const character = within(sheet).getByRole('link', { name: 'Pilot One' });

    expect(settings).toHaveAttribute('href', '/settings');
    expect(character).toHaveAttribute('href', '/characters');
    expect(within(sheet).queryByRole('button', { name: 'Pilot One' })).not.toBeInTheDocument();

    expect(contacts.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(help.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      settings.compareDocumentPosition(character) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('closes on Escape and returns focus to the More trigger', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    const moreButton = within(mobileNav).getByRole('button', { name: 'More' });
    await user.click(moreButton);
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
    expect(moreButton).toHaveFocus();
  });

  it('closes when a link in the sheet is clicked', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });

    await user.click(within(sheet).getByRole('link', { name: 'Wallet' }));
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
  });

  it('never mounts the sheet at desktop widths — no CSS-hidden dialog left inert', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    stubViewport(() => true);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
  });

  it.each([
    ['phone', false, false],
    ['desktop', true, true],
  ])(
    'new-version callout at %s widths: shown %s (on a phone it points at nothing)',
    (_width, desktop, shown) => {
      mockIsSyncConfigured.mockReturnValue(false);
      useUpdateStatus.setState({ status: 'available', found: 1 });
      stubViewport(() => desktop);
      renderLayout();
      expect(screen.queryByText('A new version is ready.') !== null).toBe(shown);
    }
  );

  describe('skip link', () => {
    function stubDesktop(matches: boolean) {
      stubViewport(() => matches);
    }

    it('is the first Tab stop at desktop widths, and Enter focuses the outlet', async () => {
      mockIsSyncConfigured.mockReturnValue(false);
      stubDesktop(true);
      const user = userEvent.setup();
      renderLayout();

      await user.tab();
      const link = screen.getByRole('link', { name: /skip to content/i });
      expect(link).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(screen.getByText('page content').parentElement).toHaveFocus();
    });

    it('is not rendered below md, where there is no rail to skip', () => {
      mockIsSyncConfigured.mockReturnValue(false);
      stubDesktop(false);
      renderLayout();

      expect(screen.queryByRole('link', { name: /skip to content/i })).not.toBeInTheDocument();
    });
  });
});

const CHARACTER_ID = 77;

async function seedGrant(scopes: readonly string[]): Promise<void> {
  await seedGrantFor(CHARACTER_ID, scopes);
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
}

describe('Layout nav marks routes the character cannot use', () => {
  it('marks only the gated routes whose scope is missing', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant(['esi-mail.read_mail.v1']);
    renderLayout();

    const rail = screen.getAllByRole('navigation')[0];
    await waitFor(() =>
      expect(within(rail).getByRole('link', { name: 'Assets' })).toHaveAttribute(
        'data-locked',
        'true'
      )
    );
    expect(within(rail).getByRole('link', { name: 'Mail' })).not.toHaveAttribute('data-locked');
    expect(within(rail).getByRole('link', { name: 'Market' })).not.toHaveAttribute('data-locked');
    expect(within(rail).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('data-locked');
    await userEvent.setup().hover(within(rail).getByRole('link', { name: 'Assets' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Needs a new login');
  });

  it('leaves the marked link navigable — the gate is where the explanation lives', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    renderLayout();

    const rail = screen.getAllByRole('navigation')[0];
    await waitFor(() =>
      expect(within(rail).getByRole('link', { name: 'Mail' })).toHaveAttribute('data-locked')
    );
    expect(within(rail).getByRole('link', { name: 'Mail' })).toHaveAttribute('href', '/mail');
  });
});

describe('Layout desktop rail domain grouping', () => {
  it('pins the character menu below the nav, in a bottom footer', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    renderLayout();
    const trigger = await screen.findByRole('link', { name: 'Pilot One' });

    const rail = screen.getAllByRole('navigation')[0];
    expect(rail.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts Settings just above the Character link, both below the nav', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    renderLayout();

    const rail = screen.getAllByRole('navigation')[0];
    expect(within(rail).queryByRole('link', { name: 'Characters' })).not.toBeInTheDocument();
    expect(within(rail).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();

    const settings = await screen.findByRole('link', { name: 'Settings' });
    const character = await screen.findByRole('link', { name: 'Pilot One' });
    expect(settings).toHaveAttribute('href', '/settings');
    expect(character).toHaveAttribute('href', '/characters');
    expect(
      settings.compareDocumentPosition(character) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('labels the Overview link "Overview", not "Home"', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();

    const rail = screen.getAllByRole('navigation')[0];
    expect(within(rail).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/overview'
    );
    expect(within(rail).queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('orders the rail as Overview, then Progression/Economy/Social groups in full, with no Alerts row', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();

    const rail = screen.getByRole('navigation', { name: 'Main navigation' });
    const items = Array.from(rail.children)
      .flatMap((el) => (el.getAttribute('role') === 'group' ? Array.from(el.children) : [el]))
      .filter((el) => el.tagName !== 'BUTTON')
      .map((el) =>
        el.tagName === 'P'
          ? `[${el.textContent}]`
          : within(el as HTMLElement).getAllByRole('link')[0].textContent
      );
    expect(items).toEqual([
      'Overview',
      '[Progression]',
      'Skills',
      'Industry',
      'Ships',
      'Mining',
      'PI',
      'Travel',
      '[Economy]',
      'Market',
      'Wallet',
      'Assets',
      'Contracts',
      '[Social]',
      'Mail',
      'Calendar',
      'Contacts',
      'Communities',
    ]);
  });

  it('no longer renders the old stale "Character" divider', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();

    const rail = screen.getAllByRole('navigation')[0];
    expect(within(rail).queryByText('Character')).not.toBeInTheDocument();
  });
});

describe('Layout runtime auth-failure notice', () => {
  it('shows nothing while no failure has been reported', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();
    expect(screen.queryByText(/: log in again$/)).not.toBeInTheDocument();
  });

  it('surfaces a runtime auth failure once, in the shell, for the active character', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    renderLayout();

    expect(screen.getByText(/: log in again$/)).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('ignores a failure belonging to another character', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID + 1);
    renderLayout();

    expect(screen.queryByText(/: log in again$/)).not.toBeInTheDocument();
  });

  it('is dismissible, so a 403 re-auth cannot fix never pins on', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    renderLayout();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/: log in again$/)).not.toBeInTheDocument();
  });

  it('does not redirect on a token failure — that is AuthFailureRedirect’s job, not the shell’s', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderLayout();

    expect(screen.queryByText(/: log in again$/)).not.toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});

describe('Layout keyboard shortcuts (issue #25)', () => {
  beforeEach(() => {
    mockIsSyncConfigured.mockReturnValue(false);
    useSingleKeyShortcuts.setState({ value: true, hydrated: true });
  });

  it('"g" then "c" switches character', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('gc');
    expect(await screen.findByText('characters page')).toBeInTheDocument();
  });

  it('still fires with Caps Lock on, where the browser reports "G" and "C"', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('{CapsLock}gc{CapsLock}');
    expect(await screen.findByText('characters page')).toBeInTheDocument();
  });

  it('"g" then "s" opens Settings', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('gs');
    expect(await screen.findByText('settings page')).toBeInTheDocument();
  });

  it('does not fire while the user is typing in an input', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await user.click(screen.getByLabelText('dummy input'));

    await user.keyboard('gc');
    expect(screen.getByText('overview page')).toBeInTheDocument();
    expect(screen.queryByText('characters page')).not.toBeInTheDocument();
  });

  it('ignores a shortcut key held with a modifier', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('g{Control>}m{/Control}');
    expect(screen.queryByText('market page')).not.toBeInTheDocument();
  });

  it('"?" opens the shortcut list, even though the layout types it with Shift', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('{Shift>}?{/Shift}');
    expect(await screen.findByText('help page')).toBeInTheDocument();
  });

  it('"/" puts the cursor in the page search box without typing the slash', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('/');
    const box = screen.getByRole('searchbox', { name: 'page search' });
    expect(box).toHaveFocus();
    expect(box).toHaveValue('');
  });

  it('does nothing for a lone letter, or a letter after a different first key', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('c');
    await user.keyboard('xc');
    await user.keyboard('gxc');
    expect(screen.queryByText('characters page')).not.toBeInTheDocument();
  });

  it('cancels a pending "g" when typing moves into a field', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('g');
    await user.click(screen.getByLabelText('dummy input'));
    await user.keyboard('c');
    expect(screen.queryByText('characters page')).not.toBeInTheDocument();
  });

  it('is switched off, "?" included, by the Single-key shortcuts setting', async () => {
    useSingleKeyShortcuts.setState({ value: false, hydrated: true });
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('gc{Shift>}?{/Shift}');
    expect(screen.queryByText('characters page')).not.toBeInTheDocument();
    expect(screen.queryByText('help page')).not.toBeInTheDocument();
  });

  it('does not turn a capital letter into a shortcut', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('g{Shift>}c{/Shift}');
    expect(screen.queryByText('characters page')).not.toBeInTheDocument();
  });

  it.each([
    ['an overlay that marked itself', 'section', KEYBOARD_OVERLAY_ATTRIBUTE, ''],
    ['a Radix popover', 'div', 'role', 'dialog'],
  ])('defers to %s', async (_label, tag, attribute, attributeValue) => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    const overlay = document.createElement(tag);
    overlay.setAttribute(attribute, attributeValue);
    document.body.append(overlay);

    try {
      await user.keyboard('gc');
      expect(screen.queryByText('characters page')).not.toBeInTheDocument();
    } finally {
      overlay.remove();
    }
  });

  it('defers to an open dialog rather than also navigating', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument();

    await user.keyboard('gc');
    expect(screen.queryByText('characters page')).not.toBeInTheDocument();
  });

  it('defers to an open Radix menu/listbox (DropdownMenu, ContextMenu, Select) the same way', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    try {
      await user.keyboard('gc');
      expect(screen.queryByText('characters page')).not.toBeInTheDocument();
    } finally {
      menu.remove();
    }
  });
});

describe('Layout corp nav entry', () => {
  it.each(['unknown', 'none', 'roles-without-grant'] as const)(
    'renders nothing for a %s character — not even a locked link',
    (state) => {
      mockIsSyncConfigured.mockReturnValue(false);
      mockedCorpAccess.mockReturnValue(corpAccess(state));
      renderLayout();
      expect(screen.queryByRole('link', { name: 'Corp Board' })).not.toBeInTheDocument();
    }
  );

  it('renders nothing for a ready character whose corporation is not yet known', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    mockedCorpAccess.mockReturnValue(corpAccess('ready'));
    useActiveCharacter.setState({ activeCharacterId: 42, hydrated: true });
    await db.characters.put({ characterId: 42, name: 'Pilot', ownerHash: 'h', addedAt: 0 });
    renderLayout();
    expect(await screen.findByText('page content')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Corp Board' })).not.toBeInTheDocument();
  });

  it('renders the entry once corp access is ready and the corporation is known', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    mockedCorpAccess.mockReturnValue(corpAccess('ready'));
    useActiveCharacter.setState({ activeCharacterId: 42, hydrated: true });
    await db.characters.put({
      characterId: 42,
      name: 'Pilot',
      ownerHash: 'h',
      addedAt: 0,
      corporationId: 98000001,
    });
    renderLayout();
    const link = await screen.findByRole('link', { name: 'Corp Board' });
    expect(link).toHaveAttribute('href', '/corp');
    expect(link).not.toHaveAttribute('data-locked');
  });
});

describe('Layout route fade', () => {
  let animate: ReturnType<typeof stubAnimate>['animate'];
  let reduceMotion: boolean;

  function renderRoutes(initial: string) {
    const mounts: string[] = [];
    function Page({ name }: { name: string }) {
      useEffect(() => {
        mounts.push(name);
      }, [name]);
      return (
        <div>
          {name} page
          <Link to="/overview?tab=x">filter overview</Link>
          <Link to="/assets/60003760">drill down</Link>
          <Link to="/contacts/across">across tab</Link>
        </div>
      );
    }
    const view = render(
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/overview" element={<Page name="overview" />} />
            <Route path="/wallet" element={<Page name="wallet" />} />
            <Route path="/assets" element={<Page name="assets" />} />
            <Route path="/assets/*" element={<Page name="assets" />} />
            <Route path="/contacts/*" element={<Page name="contacts" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    return { ...view, mounts };
  }

  beforeEach(() => {
    mockIsSyncConfigured.mockReturnValue(false);
    mockedCorpAccess.mockReturnValue(corpAccess('none'));
    reduceMotion = false;
    animate = stubAnimate().animate;
    stubViewport((media) => (media.includes('prefers-reduced-motion') ? reduceMotion : false));
  });

  it('fades the outlet in on a route change', async () => {
    const user = userEvent.setup();
    renderRoutes('/overview');
    animate.mockClear();
    await user.click(screen.getAllByRole('link', { name: 'Wallet' })[0]);
    expect(await screen.findByText('wallet page')).toBeInTheDocument();
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: 220,
      easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
    });
  });

  it('does not fade when only the search string changes', async () => {
    const user = userEvent.setup();
    renderRoutes('/overview');
    animate.mockClear();
    await user.click(screen.getByRole('link', { name: 'filter overview' }));
    expect(animate).not.toHaveBeenCalled();
  });

  it('does not animate under prefers-reduced-motion', async () => {
    reduceMotion = true;
    const user = userEvent.setup();
    renderRoutes('/overview');
    animate.mockClear();
    await user.click(screen.getAllByRole('link', { name: 'Wallet' })[0]);
    expect(await screen.findByText('wallet page')).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });

  it('keeps the route mounted when the pathname changes inside one match', async () => {
    const user = userEvent.setup();
    const { mounts } = renderRoutes('/assets');
    await waitFor(() => expect(mounts).toEqual(['assets']));
    await user.click(screen.getByRole('link', { name: 'drill down' }));
    expect(await screen.findByText('assets page')).toBeInTheDocument();
    expect(mounts).toEqual(['assets']);
    expect(animate).toHaveBeenCalled();
  });

  it('neither remounts nor fades on a tab switch — a tab is not a new page', async () => {
    const user = userEvent.setup();
    const { mounts } = renderRoutes('/contacts/character');
    await waitFor(() => expect(mounts).toEqual(['contacts']));
    animate.mockClear();
    await user.click(screen.getByRole('link', { name: 'across tab' }));
    expect(await screen.findByText('contacts page')).toBeInTheDocument();
    expect(mounts).toEqual(['contacts']);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('Layout intent warming', () => {
  beforeEach(() => {
    mockIsSyncConfigured.mockReturnValue(false);
    mockedCorpAccess.mockReturnValue(corpAccess('none'));
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    mockedWarmRoute.mockClear();
  });

  async function renderWithGrant(scopes: string[]) {
    await db.tokens.put({
      characterId: CHARACTER_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 60_000,
      scopes,
    });
    renderLayout();
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Assets' })[0]).toHaveAttribute('data-locked')
    );
    mockedWarmRoute.mockClear();
  }

  it('warms a rail destination when the pointer reaches it', async () => {
    const user = userEvent.setup();
    await renderWithGrant(['esi-calendar.read_calendar_events.v1']);
    await user.hover(screen.getAllByRole('link', { name: 'Wallet' })[0]);
    expect(mockedWarmRoute).toHaveBeenCalledWith('/wallet', CHARACTER_ID, [
      'esi-calendar.read_calendar_events.v1',
    ]);
  });

  it('warms on keyboard focus too', async () => {
    await renderWithGrant([]);
    screen.getAllByRole('link', { name: 'Wallet' })[0].focus();
    expect(mockedWarmRoute).toHaveBeenCalledWith('/wallet', CHARACTER_ID, []);
  });

  it('passes an unknown grant through as undefined rather than as empty', async () => {
    const user = userEvent.setup();
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
    renderLayout();
    await user.hover(screen.getAllByRole('link', { name: 'Wallet' })[0]);
    expect(mockedWarmRoute).toHaveBeenCalledWith('/wallet', null, undefined);
  });
});

describe('Layout site name', () => {
  it('goes back to Overview when clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/market']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/overview" element={<div>overview page</div>} />
            <Route path="/market" element={<div>market page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('market page');

    await user.click(screen.getByRole('link', { name: 'Neocom Desk' }));
    expect(await screen.findByText('overview page')).toBeInTheDocument();
  });
});

describe("Layout mobile tab bar follows the pilot's choice", () => {
  it("renders the chosen four, in the rail's order rather than the picked one", () => {
    mockIsSyncConfigured.mockReturnValue(false);
    useMobileTabs.setState({
      value: ['/mail', '/wallet', '/overview', '/assets'],
      hydrated: true,
    });
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(
      within(mobileNav)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Overview', 'Wallet', 'Assets', 'Mail']);
  });

  it('lists every page in the More sheet, the ones the bar holds included', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    useMobileTabs.setState({
      value: ['/mail', '/wallet', '/overview', '/assets'],
      hydrated: true,
    });
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });

    for (const name of ['Skills', 'Industry', 'Market', 'Overview', 'Wallet', 'Assets', 'Mail']) {
      expect(within(sheet).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('marks a locked destination in the bar, not only in the sheet', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 0,
    });
    await db.tokens.put({
      characterId: CHARACTER_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 60_000,
      scopes: [],
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    useMobileTabs.setState({
      value: ['/overview', '/assets', '/skills', '/industry'],
      hydrated: true,
    });
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await waitFor(() =>
      expect(within(mobileNav).getByRole('link', { name: 'Assets' })).toHaveAttribute(
        'data-locked',
        'true'
      )
    );
  });

  it('keeps Corp, Settings and the Character in the sheet whatever the bar holds', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    mockedCorpAccess.mockReturnValue(corpAccess('ready'));
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 0,
      corporationId: 98000001,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    useMobileTabs.setState({
      value: ['/mail', '/wallet', '/overview', '/assets'],
      hydrated: true,
    });
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });

    expect(await within(sheet).findByRole('link', { name: 'Corp Board' })).toBeInTheDocument();
    expect(await within(sheet).findByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Pilot One' })).toBeInTheDocument();
  });
});

describe('Layout Characters switch carries the page it started from (#1764)', () => {
  it('does not duplicate Characters as a plain sheet row when it is not chosen for the tab bar', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });

    const characterLinks = within(sheet)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/characters');
    expect(characterLinks).toHaveLength(1);
  });

  it("the More sheet's Character link passes the page it was opened from", async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayoutWithRoutes('/market');
    expect(await screen.findByText('market page')).toBeInTheDocument();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    await user.click(within(sheet).getByRole('link', { name: 'Switch character' }));

    expect(await screen.findByText('characters page')).toBeInTheDocument();
    expect(screen.getByTestId('characters-page-from')).toHaveTextContent('/market');
  });

  it('a tab-bar entry for Characters (once chosen) passes the page it was opened from', async () => {
    useMobileTabs.setState({
      value: ['/characters', '/mail', '/skills', '/industry'],
      hydrated: true,
    });
    const user = userEvent.setup();
    renderLayoutWithRoutes('/market');
    expect(await screen.findByText('market page')).toBeInTheDocument();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('link', { name: 'Characters' }));

    expect(await screen.findByText('characters page')).toBeInTheDocument();
    expect(screen.getByTestId('characters-page-from')).toHaveTextContent('/market');
  });

  it("the desktop rail's Character link carries the current page as its origin (#4691)", async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayoutWithRoutes('/market');
    expect(await screen.findByText('market page')).toBeInTheDocument();

    const rail = screen.getByRole('complementary');
    await user.click(within(rail).getByRole('link', { name: 'Switch character' }));

    expect(await screen.findByText('characters page')).toBeInTheDocument();
    expect(screen.getByTestId('characters-page-from')).toHaveTextContent('/market');
  });
});
