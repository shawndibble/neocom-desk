import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useAuthFailure } from '@/stores/authFailure';
import { Layout } from './Layout';

const mockSubscribe = vi.fn();
vi.mock('@/sync', () => ({
  subscribeSyncStatus: (listener: (s: unknown) => void) => mockSubscribe(listener),
}));

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
          {/* The "More" sheet links to /wallet; without a route for it, clicking
              through logs React Router's "No routes matched" console error. */}
          <Route path="/wallet" element={<div>wallet page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

/** For the shortcut tests below, which need more than one destination route. */
function renderLayoutWithRoutes() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/overview"
            element={
              <div>
                <p>overview page</p>
                <input aria-label="dummy input" />
              </div>
            }
          />
          <Route path="/market" element={<div>market page</div>} />
          <Route path="/characters" element={<div>characters page</div>} />
          <Route path="/settings" element={<div>settings page</div>} />
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
  await db.tokens.clear();
  await db.characters.clear();
});

describe('Layout sync status dot', () => {
  it('is hidden when sync is unconfigured', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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
  it('keeps 3 primary tabs + More in the mobile tab bar', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(
      within(mobileNav)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Overview', 'Skills', 'Industry']);
    expect(within(mobileNav).getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('opens a dialog listing Wallet, Assets, Mail, Calendar, Contracts and Orders (not Styleguide)', async () => {
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
    for (const label of ['Wallet', 'Assets', 'Mail', 'Calendar', 'Contracts', 'Orders']) {
      expect(within(sheet).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(sheet).queryByRole('link', { name: 'Styleguide' })).not.toBeInTheDocument();
    // Overview tabs now, reached from the Overview page rather than the sheet.
    expect(within(sheet).queryByRole('link', { name: 'Clones' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'Employment' })).not.toBeInTheDocument();
  });

  it('leads with a Character disclosure holding Characters and Settings', async () => {
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

    const disclosure = await within(sheet).findByRole('button', { name: 'Pilot One' });
    // First control in the sheet — Settings has no other route on a phone.
    expect(
      disclosure.compareDocumentPosition(within(sheet).getByRole('link', { name: 'Market' })) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(within(sheet).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(within(sheet).getByRole('link', { name: 'Characters' })).toHaveAttribute(
      'href',
      '/characters'
    );
    expect(within(sheet).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
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
    const realMatchMedia = window.matchMedia;
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: true,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;

    try {
      const user = userEvent.setup();
      renderLayout();

      const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
      await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
      expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });
});

const CHARACTER_ID = 77;

async function seedGrant(scopes: readonly string[]): Promise<void> {
  await db.tokens.put({
    characterId: CHARACTER_ID,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
    scopes: [...scopes],
  });
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
        'title',
        'Needs a new login'
      )
    );
    // Granted, so unmarked — and so is every ungated route.
    expect(within(rail).getByRole('link', { name: 'Mail' })).not.toHaveAttribute('title');
    expect(within(rail).getByRole('link', { name: 'Market' })).not.toHaveAttribute('title');
    expect(within(rail).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('title');
  });

  it('leaves the marked link navigable — the gate is where the explanation lives', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    renderLayout();

    const rail = screen.getAllByRole('navigation')[0];
    await waitFor(() =>
      expect(within(rail).getByRole('link', { name: 'Mail' })).toHaveAttribute('title')
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
    const trigger = await screen.findByRole('button', { name: 'Pilot One' });

    const rail = screen.getAllByRole('navigation')[0];
    // The trigger must follow the nav landmark in document order — it is
    // pinned under the groups, not stacked above them.
    expect(rail.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the pinned character menu onto Characters and Settings', async () => {
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

    // Both routes left the rail proper; this menu is now their only pointer
    // affordance on desktop.
    const rail = screen.getAllByRole('navigation')[0];
    expect(within(rail).queryByRole('link', { name: 'Characters' })).not.toBeInTheDocument();
    expect(within(rail).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Pilot One' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Characters' })).toHaveAttribute(
      'href',
      '/characters'
    );
    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
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

  it('orders the rail as Overview, then Progression/Economy/Social groups in full', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();

    const rail = screen.getAllByRole('navigation')[0];
    const items = Array.from(rail.children).map((el) =>
      el.tagName === 'P' ? `[${el.textContent}]` : el.textContent
    );
    expect(items).toEqual([
      'Overview',
      // Characters and Settings moved to the pinned character menu; Clones and
      // Employment History became Overview tabs; Market joined Economy, which
      // emptied General out of existence.
      '[Progression]',
      'Skills',
      'Industry',
      'Planetary Industry',
      '[Economy]',
      'Market',
      'Wallet',
      'Assets',
      'Orders',
      'Contracts',
      '[Social]',
      'Mail',
      'Calendar',
      'Contacts',
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
    expect(screen.queryByText(/eve access was refused/i)).not.toBeInTheDocument();
  });

  it('surfaces a runtime auth failure once, in the shell, for the active character', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    renderLayout();

    expect(screen.getByText(/eve access was refused/i)).toBeInTheDocument();
    // Still on the page: a refused request is not a reason to move the user.
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('ignores a failure belonging to another character', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID + 1);
    renderLayout();

    expect(screen.queryByText(/eve access was refused/i)).not.toBeInTheDocument();
  });

  it('is dismissible, so a 403 re-auth cannot fix never pins on', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    renderLayout();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/eve access was refused/i)).not.toBeInTheDocument();
  });

  it('does not redirect on a token failure — that is AuthFailureRedirect’s job, not the shell’s', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    await seedGrant([]);
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderLayout();

    expect(screen.queryByText(/eve access was refused/i)).not.toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});

describe('Layout keyboard shortcuts (issue #25)', () => {
  beforeEach(() => {
    mockIsSyncConfigured.mockReturnValue(false);
  });

  it('"/" jumps to Market', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('/');
    expect(await screen.findByText('market page')).toBeInTheDocument();
  });

  it('"c" switches character', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('c');
    expect(await screen.findByText('characters page')).toBeInTheDocument();
  });

  it('"c" still fires with Caps Lock on, where the browser reports it as "C"', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('{CapsLock}c{CapsLock}');
    expect(await screen.findByText('characters page')).toBeInTheDocument();
  });

  it('"," opens Settings', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard(',');
    expect(await screen.findByText('settings page')).toBeInTheDocument();
  });

  it('does not fire while the user is typing in an input', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await user.click(screen.getByLabelText('dummy input'));

    await user.keyboard('c');
    expect(screen.getByText('overview page')).toBeInTheDocument();
    expect(screen.queryByText('characters page')).not.toBeInTheDocument();
  });

  it('ignores a shortcut key held with a modifier', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    await user.keyboard('{Control>}/{/Control}');
    expect(screen.queryByText('market page')).not.toBeInTheDocument();
  });

  it('defers to an open dialog rather than also navigating', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument();

    await user.keyboard('c');
    expect(screen.queryByText('characters page')).not.toBeInTheDocument();
  });

  it('defers to an open Radix menu/listbox (DropdownMenu, ContextMenu, Select) the same way', async () => {
    const user = userEvent.setup();
    renderLayoutWithRoutes();
    await screen.findByText('overview page');

    // Stands in for one of those primitives: none force-mount while closed
    // (`components/ui/DropdownMenu.tsx` et al.), so an open one is exactly
    // this — a `role="menu"`/`role="listbox"` element present in the DOM.
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    try {
      await user.keyboard('c');
      expect(screen.queryByText('characters page')).not.toBeInTheDocument();
    } finally {
      menu.remove();
    }
  });
});
