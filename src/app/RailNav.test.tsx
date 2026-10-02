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
import { Layout } from './Layout';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mocked(useCorpAccess).mockReturnValue({
  state: 'none',
  capabilities: NO_CORP_CAPABILITIES,
  missingScopes: [],
  roles: [],
});

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
  setPhone(false);
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  useMobileTabs.setState({ value: DEFAULT_MOBILE_TABS, hydrated: true });
  useHiddenNav.setState({ value: [], hydrated: true });
  useRecentNav.setState({ value: [], hydrated: true });
  useCommandPalette.setState({ open: false });
  await db.settings.clear();
});

describe('the rail', () => {
  it("opens the current page's views and leaves the others closed", () => {
    renderAt('/market/appraisal');

    const views = within(rail()).getByRole('list', { name: 'Market' });
    expect(within(views).getByRole('link', { name: 'Appraisal' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(views).getByRole('link', { name: 'LP Store' })).toHaveAttribute(
      'href',
      '/market/lp-store'
    );
    expect(within(rail()).queryByRole('list', { name: 'Industry' })).not.toBeInTheDocument();
    expect(within(rail()).getByRole('button', { name: /^Industry views/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
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
    expect(within(rail()).getByRole('button', { name: '3 hidden · Edit' })).toBeInTheDocument();
  });

  it('hides and shows pages from the rail editor, and never offers to hide Corporation or Settings', async () => {
    const user = userEvent.setup();
    renderAt('/overview');

    await user.click(within(rail()).getByRole('button', { name: /hide pages you don't use/i }));
    // One fixed name; `aria-pressed` says whether it is on.
    const mining = within(rail()).getByRole('button', { name: 'Show Mining in navigation' });
    expect(mining).toHaveAttribute('aria-pressed', 'true');
    await user.click(mining);
    await waitFor(() => expect(useHiddenNav.getState().value).toEqual(['/mining']));
    // Still listed while editing, so it can be shown again.
    expect(
      within(rail()).getByRole('button', { name: 'Show Mining in navigation' })
    ).toHaveAttribute('aria-pressed', 'false');
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

    expect(within(sheet).getByRole('link', { name: 'Market' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Pilot Lookup' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'Appraisal' })).not.toBeInTheDocument();
  });

  it('folds hidden pages into one row that opens in place, so every page stays reachable', async () => {
    setPhone(true);
    useHiddenNav.setState({ value: ['/mining', '/calendar'] });
    renderAt('/overview');
    const { user, sheet } = await openSheet();

    expect(within(sheet).queryByRole('link', { name: 'Mining' })).not.toBeInTheDocument();
    const row = within(sheet).getByRole('button', { name: /2 hidden: Mining, Calendar/ });
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(within(sheet).getByRole('link', { name: 'Mining' })).toBeInTheDocument();
  });

  it('shows recent views other than the current one', async () => {
    setPhone(true);
    useRecentNav.setState({ value: ['/overview', '/market/appraisal', '/travel/thera'] });
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
    await db.settings.put({ key: 'navRecent', value: ['/travel/thera', '/assets'] });
    useRecentNav.setState({ value: [], hydrated: false });
    renderAt('/market/appraisal');
    await waitFor(() =>
      expect(useRecentNav.getState().value).toEqual([
        '/market/appraisal',
        '/travel/thera',
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
  });
});
