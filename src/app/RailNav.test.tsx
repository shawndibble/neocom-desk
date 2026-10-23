import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useCommandPalette } from '@/features/commandPalette/store';
import { DEFAULT_MOBILE_TABS, useMobileTabs } from '@/lib/mobileTabs';
import { useHiddenNav, useRecentNav } from './navPreferences';
import { defaultHiddenNav } from './navRail';
import { Layout } from './Layout';
import { useSrpNavVisible } from '@/features/corp/srp/useSrpNavVisible';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mocked(useCorpAccess).mockReturnValue({
  state: 'none',
  capabilities: NO_CORP_CAPABILITIES,
  missingScopes: [],
  roles: [],
  readFailed: false,
  retry: () => {},
});

vi.mock('@/features/corp/srp/useSrpNavVisible', () => ({ useSrpNavVisible: vi.fn() }));

import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';
vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  subscribeSyncStatus: () => () => {},
}));
vi.mock('./routeWarm', () => ({ warmRoute: vi.fn() }));
vi.mock('./syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./syncStatus')>()),
  isSyncConfigured: () => false,
}));
// The palette itself is `CommandPalette.test.tsx`'s subject; here only whether it opens.
vi.mock('@/features/commandPalette/CommandPaletteHost', () => ({
  CommandPaletteHost: () => null,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const rail = () => screen.getByRole('navigation', { name: 'Main navigation' });

function setPhone(phone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(min-width: 48rem)' ? !phone : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(async () => {
  vi.mocked(useCorpAccess).mockReturnValue({
    state: 'none',
    capabilities: NO_CORP_CAPABILITIES,
    missingScopes: [],
    roles: [],
    readFailed: false,
    retry: () => {},
  });
  vi.mocked(useSrpNavVisible).mockReturnValue(false);
  setPhone(false);
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  useMobileTabs.setState({ value: DEFAULT_MOBILE_TABS, hydrated: true });
  useHiddenNav.setState({ value: [], hydrated: true });
  useRecentNav.setState({ value: [], hydrated: true });
  useCommandPalette.setState({ open: false });
  await db.settings.clear();
});

describe('the rail', () => {
  it('draws a Corporation group of the permitted Corp pages, with Moons open on /corp/moons', async () => {
    vi.mocked(useCorpAccess).mockReturnValue({
      state: 'ready',
      capabilities: { ...NO_CORP_CAPABILITIES, canReadWallet: true },
      missingScopes: [],
      roles: ['Junior_Accountant'],
      readFailed: false,
      retry: () => {},
    });
    await db.characters.put({
      characterId: 42,
      name: 'Pilot',
      ownerHash: 'h',
      addedAt: 0,
      corporationId: 98000001,
    });
    useActiveCharacter.setState({ activeCharacterId: 42, hydrated: true });
    renderAt('/corp/moons');

    const group = await within(rail()).findByRole('group', { name: 'Corporation' });
    const names = within(group)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(names).toEqual(expect.arrayContaining(['Corp Board', 'Corp Wallet', 'Moons']));
    expect(names).not.toContain('Corp Assets');
    expect(names).not.toContain('Members');
    expect(within(group).getByRole('link', { name: 'Statements' })).toBeInTheDocument();
  });

  it('marks only Corp Wallet current on /corp/wallet, not Corp Board above it', async () => {
    vi.mocked(useCorpAccess).mockReturnValue({
      state: 'ready',
      capabilities: { ...NO_CORP_CAPABILITIES, canReadWallet: true },
      missingScopes: [],
      roles: ['Junior_Accountant'],
      readFailed: false,
      retry: () => {},
    });
    await db.characters.put({
      characterId: 42,
      name: 'Pilot',
      ownerHash: 'h',
      addedAt: 0,
      corporationId: 98000001,
    });
    useActiveCharacter.setState({ activeCharacterId: 42, hydrated: true });
    renderAt('/corp/wallet');

    const group = await within(rail()).findByRole('group', { name: 'Corporation' });
    expect(within(group).getByRole('link', { name: 'Corp Wallet' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(group).getByRole('link', { name: 'Corp Board' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('draws no Corporation group, heading included, without Corp Access', () => {
    renderAt('/overview');
    expect(screen.queryByText('Corporation')).not.toBeInTheDocument();
  });

  it("lists LP Store among Wallet's views, current on a store's page (#3527)", () => {
    renderAt('/wallet/lp-store/1000125');

    const views = within(rail()).getByRole('list', { name: 'Wallet' });
    expect(within(views).getByRole('link', { name: 'LP Store' })).toHaveAttribute(
      'href',
      '/wallet/lp-store'
    );
    expect(within(views).getByRole('link', { name: 'Balance' })).toBeInTheDocument();
  });

  it("opens the current page's views and leaves the others closed", () => {
    renderAt('/market/appraisal');

    const views = within(rail()).getByRole('list', { name: 'Market' });
    expect(within(views).getByRole('link', { name: 'Appraisal' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(views).queryByRole('link', { name: 'LP Store' })).not.toBeInTheDocument();
    expect(within(rail()).queryByRole('list', { name: 'Industry' })).not.toBeInTheDocument();
    expect(within(rail()).getByRole('button', { name: /^Industry views/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('lists SRP under Overview for a pilot whose corp has SRP on, and not in the Corporation group', async () => {
    vi.mocked(useSrpNavVisible).mockReturnValue(true);
    renderAt('/srp');
    const views = within(rail()).getByRole('list', { name: 'Overview' });
    expect(within(views).getByRole('link', { name: 'SRP' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(rail()).queryByRole('group', { name: 'Corporation' })).not.toBeInTheDocument();
  });

  it('leaves SRP off the Overview views, hidden rather than dimmed, while the corp has SRP off', () => {
    renderAt('/clones');
    const views = within(rail()).getByRole('list', { name: 'Overview' });
    expect(within(views).queryByRole('link', { name: 'SRP' })).not.toBeInTheDocument();
  });

  it('lists only the SRP tabs an officer can see under Corp SRP', async () => {
    vi.mocked(useCorpAccess).mockReturnValue({
      state: 'ready',
      capabilities: { ...NO_CORP_CAPABILITIES, canManageSrp: true },
      missingScopes: [],
      roles: ['Director'],
      readFailed: false,
      retry: () => {},
    });
    await db.characters.put({
      characterId: 42,
      name: 'Pilot',
      ownerHash: 'h',
      addedAt: 0,
      corporationId: 98000001,
    });
    useActiveCharacter.setState({ activeCharacterId: 42, hydrated: true });
    vi.mocked(useSrpNavVisible).mockReturnValue(true);
    renderAt('/corp/srp/queue');
    const views = await within(rail()).findByRole('list', { name: 'SRP' });
    expect(
      within(views)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Queue', 'Settings']);
  });

  it('opens a sub-view’s page even where its path does not nest under it', () => {
    renderAt('/clones');
    expect(within(rail()).getByRole('list', { name: 'Overview' })).toBeInTheDocument();
  });

  it('opens another page to look inside, and closes it again on arriving somewhere', async () => {
    const user = userEvent.setup();
    renderAt('/market/appraisal');

    await user.click(within(rail()).getByRole('button', { name: /^Industry views/ }));
    const industry = within(rail()).getByRole('list', { name: 'Industry' });
    // One section open at a time: looking inside Industry closes Market.
    expect(within(rail()).queryByRole('list', { name: 'Market' })).not.toBeInTheDocument();

    await user.click(within(rail()).getByRole('link', { name: 'Wallet' }));
    expect(industry).not.toBeInTheDocument();
    expect(within(rail()).getByRole('list', { name: 'Wallet' })).toBeInTheDocument();
  });

  it('opens the command palette from the Go to button, which shows the chord', async () => {
    const user = userEvent.setup();
    renderAt('/overview');

    const goTo = screen.getByRole('button', { name: /go to/i });
    expect(goTo).toHaveTextContent(/ctrl k|⌘k/i);
    await user.click(goTo);
    expect(useCommandPalette.getState().open).toBe(true);
  });

  it('leaves out what the pilot hid, unless it is where they are', () => {
    useHiddenNav.setState({ value: ['/mining', '/planetary-industry', '/market/hauling'] });
    renderAt('/planetary-industry');

    expect(within(rail()).queryByRole('link', { name: 'Mining' })).not.toBeInTheDocument();
    expect(within(rail()).getByRole('link', { name: 'PI' })).toBeInTheDocument();
    expect(within(rail()).queryByRole('button', { name: /more page/ })).not.toBeInTheDocument();
  });

  it('groups the rail’s pages under their labels', () => {
    renderAt('/overview');

    const economy = within(rail()).getByRole('group', { name: /economy/i });
    expect(within(economy).getByRole('link', { name: 'Market' })).toBeInTheDocument();
  });

  it('starts a new pilot on the eight-page default, the rest hidden with no "more pages" row', () => {
    useHiddenNav.setState({ value: defaultHiddenNav() });
    renderAt('/overview');

    expect(within(rail()).queryByRole('link', { name: 'Mining' })).not.toBeInTheDocument();
    for (const name of ['Skills', 'Industry', 'Ships', 'Market', 'Assets', 'Wallet', 'Travel']) {
      expect(within(rail()).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(rail()).queryByRole('button', { name: /more pages/ })).not.toBeInTheDocument();
  });

  it('hides and shows pages from the rail editor, and never offers to hide Corporation or Settings', async () => {
    const user = userEvent.setup();
    renderAt('/overview');

    await user.click(within(rail()).getByRole('button', { name: 'Customize' }));
    // One fixed name; `aria-pressed` says whether it is on.
    const mining = within(rail()).getByRole('button', { name: 'Show Mining in navigation' });
    expect(mining).toHaveAttribute('aria-pressed', 'true');
    await user.click(mining);
    await waitFor(() => expect(useHiddenNav.getState().value).toEqual(['/mining']));
    // Still listed while editing, so it can be shown again.
    expect(
      within(rail()).getByRole('button', { name: 'Show Mining in navigation' })
    ).toHaveAttribute('aria-pressed', 'false');
    // Struck through, not faded: a fade drops the label below 4.5:1.
    const miningLink = within(rail()).getByRole('link', { name: /mining/i });
    expect(miningLink).toHaveClass('line-through');
    expect(miningLink.className).not.toMatch(/opacity-/);
    expect(miningLink.parentElement?.className).not.toMatch(/opacity-/);
    await user.click(within(rail()).getByRole('button', { name: 'Show Mining in navigation' }));
    await waitFor(() => expect(useHiddenNav.getState().value).toEqual([]));
    expect(
      screen.queryByRole('button', { name: 'Show Settings in navigation' })
    ).not.toBeInTheDocument();

    await user.click(within(rail()).getByRole('button', { name: 'Done' }));
    expect(
      within(rail()).queryByRole('button', { name: 'Show Overview in navigation' })
    ).not.toBeInTheDocument();
  });

  it('hands focus to Done after Customize and back after Done, rather than dropping it to the page', async () => {
    const user = userEvent.setup();
    renderAt('/overview');

    await user.click(within(rail()).getByRole('button', { name: 'Customize' }));
    await waitFor(() => expect(within(rail()).getByRole('button', { name: 'Done' })).toHaveFocus());
    await user.click(within(rail()).getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(within(rail()).getByRole('button', { name: 'Customize' })).toHaveFocus()
    );
  });
});

describe('the More sheet', () => {
  async function openSheet() {
    const user = userEvent.setup();
    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(nav).getByRole('button', { name: 'More' }));
    return { user, sheet: screen.getByRole('dialog', { name: 'More' }) };
  }

  it('lists pages as tiles, not their views', async () => {
    setPhone(true);
    renderAt('/overview');
    const { sheet } = await openSheet();

    expect(within(sheet).getByRole('link', { name: 'Wallet' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Travel' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'Appraisal' })).not.toBeInTheDocument();
  });

  it('leaves hidden pages out of the sheet, with no fold row', async () => {
    setPhone(true);
    useHiddenNav.setState({ value: ['/mining', '/calendar'] });
    renderAt('/overview');
    const { sheet } = await openSheet();

    expect(within(sheet).queryByRole('link', { name: 'Mining' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /hidden:/ })).not.toBeInTheDocument();
  });

  it('shows recent views other than the current one', async () => {
    setPhone(true);
    useRecentNav.setState({ value: ['/overview', '/market/appraisal', '/travel/pilot'] });
    renderAt('/overview');
    const { sheet } = await openSheet();

    const recent = within(sheet).getByRole('region', { name: 'Recent' });
    expect(within(recent).getByRole('link', { name: /Market › Appraisal/ })).toHaveAttribute(
      'href',
      '/market/appraisal'
    );
    expect(within(recent).queryByRole('link', { name: /^Overview$/ })).not.toBeInTheDocument();
  });

  it('closes itself and opens the command palette from its search field', async () => {
    setPhone(true);
    renderAt('/overview');
    const { user, sheet } = await openSheet();

    await user.click(within(sheet).getByRole('button', { name: /search pages, items, pilots/i }));
    await waitFor(() => expect(useCommandPalette.getState().open).toBe(true));
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
  });
});

describe('the Recent row', () => {
  it('records each view visited', async () => {
    renderAt('/market/appraisal');
    await waitFor(() => expect(useRecentNav.getState().value[0]).toBe('/market/appraisal'));
  });

  it('keeps the stored history when the first visit lands before the store has loaded', async () => {
    await db.settings.put({ key: 'navRecent', value: ['/travel/pilot', '/assets'] });
    useRecentNav.setState({ value: [], hydrated: false });
    renderAt('/market/appraisal');
    await waitFor(() =>
      expect(useRecentNav.getState().value).toEqual([
        '/market/appraisal',
        '/travel/pilot',
        '/assets',
      ])
    );
  });
});

describe('the More sheet editor', () => {
  it('hides and shows pages on a phone too', async () => {
    setPhone(true);
    renderAt('/overview');
    const user = userEvent.setup();
    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(nav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });

    await user.click(within(sheet).getByRole('button', { name: /hide pages you don't use/i }));
    await user.click(within(sheet).getByRole('button', { name: 'Show Mining in navigation' }));
    await waitFor(() => expect(useHiddenNav.getState().value).toEqual(['/mining']));
    // No fade, and no second eye glyph: the toggle button alone marks it.
    const tile = within(sheet).getByRole('link', { name: /mining/i }).parentElement!;
    expect(tile.className).not.toMatch(/opacity-/);
    expect(tile.querySelector(':scope > svg')).toBeNull();
  });
});
