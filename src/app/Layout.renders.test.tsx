import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { DEFAULT_MOBILE_TABS, useMobileTabs } from '@/lib/mobileTabs';
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';
import { Layout } from './Layout';

/**
 * Pages write their filters and sort into the query string as the pilot types
 * (`useUrlState` and friends), so a location change that only touches
 * `?search` is the common case, not the rare one. It must re-render the page
 * and the nav links, never the shell around them. Kept apart from
 * `Layout.test.tsx` because the render counter replaces a real child module.
 *
 * Every async read the shell makes is stubbed to a synchronous, stable value,
 * so no live query can land mid-test and bump the counter on its own: the
 * count after the first paint is final, with no timing window to wait out.
 */

// A direct child of Layout's body, outside the route outlet: it re-renders
// exactly when Layout itself does, so it doubles as Layout's render counter.
const shellRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('./StandingsScopeNotice', () => ({
  StandingsScopeNotice: () => {
    shellRenders.count += 1;
    return null;
  },
}));

// Dexie-backed reads, answered synchronously with their empty value.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (_query: unknown, _deps?: unknown, defaultResult?: unknown) => defaultResult,
}));
vi.mock('@/features/notifications/useUnreadAlertCount', () => ({
  useUnreadAlertCount: () => 0,
}));
const NO_LOCKED_ROUTES = vi.hoisted(() => new Set());
vi.mock('./useGrantedScopes', () => ({
  useGrantedScopes: () => undefined,
  useLockedRoutes: () => NO_LOCKED_ROUTES,
}));
vi.mock('@/features/corp/owner', () => ({ useActiveCorporationId: () => null }));
vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  subscribeSyncStatus: () => () => {},
}));
vi.mock('./routeWarm', () => ({ warmRoute: vi.fn() }));

/** A page that writes its own query string, the way a filtered table does. */
function FilteringPage({ name }: { name: string }) {
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <p>
        {name} page, filter: {params.get('q') ?? ''}
      </p>
      <button type="button" onClick={() => setParams({ q: `${params.get('q') ?? ''}x` })}>
        filter
      </button>
      <Link to="/market">to market</Link>
    </div>
  );
}

/** Shows the return-to-origin a switch-character link carries (#1764). */
function CharactersPage() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return <p>characters page, from: {from ?? ''}</p>;
}

/** Reads the location and renders Layout, as `SignedInShell` in App.tsx does. */
function LocationReadingParent() {
  useLocation();
  return <Layout />;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/wallet']}>
      <Routes>
        <Route element={<LocationReadingParent />}>
          <Route path="/wallet" element={<FilteringPage name="wallet" />} />
          <Route path="/market" element={<FilteringPage name="market" />} />
          <Route path="/characters" element={<CharactersPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function railLink(name: string): HTMLElement {
  const rail = screen.getAllByRole('link', { name }).find((link) => link.closest('aside'));
  if (rail === undefined) throw new Error(`no rail link named ${name}`);
  return rail;
}

beforeEach(() => {
  shellRenders.count = 0;
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  vi.mocked(useCorpAccess).mockReturnValue({
    state: 'none',
    capabilities: NO_CORP_CAPABILITIES,
    missingScopes: [],
    roles: [],
  });
  useMobileTabs.setState({ value: DEFAULT_MOBILE_TABS, hydrated: true });
});

describe('Layout render isolation from the query string', () => {
  it('counts a real shell re-render (positive control)', async () => {
    renderShell();
    await screen.findByText(/wallet page, filter:/);
    const before = shellRenders.count;

    // A store Layout subscribes to directly: a change must reach the counter.
    act(() => {
      useMobileTabs.setState({ value: [...DEFAULT_MOBILE_TABS].reverse() });
    });

    expect(shellRenders.count).toBeGreaterThan(before);
  });

  it('does not re-render the shell when only search params change', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByText(/wallet page, filter:/);
    const before = shellRenders.count;

    await user.click(screen.getByRole('button', { name: 'filter' }));
    await user.click(screen.getByRole('button', { name: 'filter' }));

    expect(await screen.findByText('wallet page, filter: xx')).toBeInTheDocument();
    expect(shellRenders.count).toBe(before);
  });

  it('still moves the active nav highlight and the outlet on a pathname change', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByText(/wallet page, filter:/);
    expect(railLink('Wallet')).toHaveAttribute('aria-current', 'page');
    expect(railLink('Market')).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('link', { name: 'to market' }));

    expect(await screen.findByText(/market page, filter:/)).toBeInTheDocument();
    expect(railLink('Market')).toHaveAttribute('aria-current', 'page');
    expect(railLink('Wallet')).not.toHaveAttribute('aria-current');
  });

  it("points the More sheet's Character link back at the page navigated to", async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByText(/wallet page, filter:/);
    await user.click(screen.getByRole('link', { name: 'to market' }));
    await screen.findByText(/market page, filter:/);

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    await user.click(within(sheet).getByRole('link', { name: 'Switch character' }));

    expect(await screen.findByText('characters page, from: /market')).toBeInTheDocument();
  });
});
