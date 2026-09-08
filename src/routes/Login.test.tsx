import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { SCOPES } from '@/esi/scopes';
import { assignLocation } from '@/app/navigation';
import { Login } from './Login';

vi.mock('@/app/navigation', () => ({ assignLocation: vi.fn() }));

/**
 * Every scope in the Base Grant, against the words `login.permissionsHint`
 * discloses it with. Hand-maintained on purpose: only a person can decide how
 * a new scope should be described to someone deciding whether to grant it.
 * Two scopes may share a phrase where the disclosure honestly is the same
 * (`read_clones`/`read_implants`), but a scope may never be absent.
 */
const BASE_GRANT_PHRASES: Record<string, string> = {
  'esi-skills.read_skills.v1': 'skills and training queue',
  'esi-skills.read_skillqueue.v1': 'skills and training queue',
  'esi-clones.read_clones.v1': 'clones and implants',
  'esi-clones.read_implants.v1': 'clones and implants',
  'esi-universe.read_structures.v1': 'player structures you can dock at',
  'esi-search.search_structures.v1': 'a search across them',
  'esi-characters.read_blueprints.v1': 'blueprints',
  'esi-wallet.read_character_wallet.v1': 'wallet',
  'esi-assets.read_assets.v1': 'assets',
  'esi-mail.read_mail.v1': 'mail',
  'esi-calendar.read_calendar_events.v1': 'calendar',
  'esi-characters.read_notifications.v1': 'notifications',
  'esi-contracts.read_character_contracts.v1': 'contracts',
  'esi-markets.read_character_orders.v1': 'market orders',
  'esi-industry.read_character_jobs.v1': 'industry jobs',
  'esi-industry.read_character_mining.v1': 'mining ledger',
  'esi-characters.read_corporation_roles.v1': 'corporation roles',
  'esi-planets.manage_planets.v1': 'planetary colonies',
  'esi-characters.read_contacts.v1': 'contacts',
  'esi-characters.read_loyalty.v1': 'loyalty points',
  'esi-location.read_location.v1': 'current location',
};

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/characters" element={<p>character list</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  vi.mocked(assignLocation).mockClear();
  vi.stubEnv('VITE_EVE_CLIENT_ID', 'test-client-id');
  sessionStorage.clear();
  await db.characters.clear();
});

describe('Login', () => {
  it('shows the app name, hero heading and SSO button', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /command deck for every character you fly/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /log in with eve online/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('links the footer "Free & open source" text to the repo', async () => {
    renderLogin();
    await screen.findByRole('heading', { name: /command deck for every character you fly/i });
    expect(screen.getByRole('link', { name: /free & open source/i })).toHaveAttribute(
      'href',
      'https://github.com/shawndibble/neocom-desk'
    );
  });

  it('leads with the questions the app answers', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /the questions it exists to answer/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /which of my orders is quietly losing isk/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /is this blueprint worth building today/i })
    ).toBeInTheDocument();
  });

  // The catalog is the page's claim about what shipped, and it silently rotted
  // once before: the eight rows it listed predated Moon Mining, Corporation,
  // Notifications and the Open Orders worklist. This pins the rows that exist,
  // so renaming or dropping one becomes a deliberate two-file edit instead of
  // a silent drift. It deliberately does NOT catch the failure that caused the
  // rot — a new route shipping with no row here still fails nothing, because
  // nothing enumerates the app's routes and not every route earns a row. The
  // consent list below is the half that *can* be derived, and is.
  it('groups the feature catalog and names the surfaces that ship today', async () => {
    renderLogin();
    // Scoped to the catalog: "Clones" and "Market" also appear in the hero's
    // preview panel, so an unscoped query matches two nodes.
    const catalog = within(
      await screen.findByRole('region', { name: /everything outside the client/i })
    );

    for (const group of ['Progression', 'Economy', 'Operations']) {
      expect(catalog.getByRole('heading', { name: group })).toBeInTheDocument();
    }
    for (const feature of [
      'Skills',
      'Clones',
      'Industry',
      'Market',
      'Market Orders',
      'Wallet & LP',
      'Assets',
      'Planetary Industry',
      'Moon Mining',
      'Corporation',
      'Notifications',
      'Mail, Calendar & Contracts',
    ]) {
      expect(catalog.getByText(feature)).toBeInTheDocument();
    }
  });

  /*
   * The hero preview is a mockup of the Overview board, and it rotted silently
   * once: the triage-board redesign deleted `overview.queue`,
   * `overview.notifications`, `overview.training` and `overview.finishes`, and
   * because i18next renders a missing key as the key itself, the signed-out
   * landing page printed the literal string `overview.queue` at visitors. Every
   * test in this file still passed.
   *
   * So two things are pinned. The first is that the preview speaks the board's
   * own vocabulary, which is what stops it drifting into a layout the app does
   * not have. The second is the general guard: no unresolved key may reach the
   * page at all — that is the assertion that would have caught the original
   * failure, and it catches the next one wherever on this page it happens.
   */
  it("previews the Overview board using the board's own labels", async () => {
    renderLogin();
    const preview = within(await screen.findByRole('group', { name: /signed-in view/i }));

    // The summary strip: the three cells the real strip carries.
    for (const label of ['Next deadline', 'Training now', 'Wallet']) {
      expect(preview.getByText(label)).toBeInTheDocument();
    }
    expect(preview.getByText('4 colonies end together')).toBeInTheDocument();

    // Open orders: counts, not rows — the one rule the redesign turns on.
    expect(preview.getByText('Open orders')).toBeInTheDocument();
    expect(preview.getByText('27 need work')).toBeInTheDocument();
    for (const [count, label] of [
      ['21', 'Undercut'],
      ['4', 'Outbid'],
      ['2', 'Relist'],
    ]) {
      expect(preview.getByText(label)).toBeInTheDocument();
      expect(preview.getAllByText(count).length).toBeGreaterThan(0);
    }

    // Alerts are folded to a line rather than given a card, as on a phone.
    expect(preview.getByText('Alerts')).toBeInTheDocument();
    expect(preview.getByText('70 unread')).toBeInTheDocument();
  });

  it('renders no unresolved i18n keys anywhere on the page', async () => {
    const { container } = renderLogin();
    await screen.findByRole('group', { name: /signed-in view/i });

    // An i18next miss renders the key verbatim. Real copy on this page never
    // contains a dotted path under one of the app's namespaces, so anything
    // matching is a key that failed to resolve.
    //
    // Deliberately no leading : `textContent` runs the DOM's text together,
    // so the real failure arrived as "...1,234,567,890.12 ISKoverview.queue2m
    // ago..." — no word boundary in front of the key at all. An anchored
    // pattern here passes against the very bug this test exists to catch.
    const leaked = (container.textContent ?? '').match(
      /(?:overview|login|skills|notifications|common|nav|settings|market|industry)\.[a-zA-Z][\w.]*/g
    );
    expect(leaked ?? []).toEqual([]);
  });

  it('answers the trust objections and enumerates the scopes it asks for', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /read-only, and it stays that way/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /never writes to your account/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /your refresh token stays in this browser/i })
    ).toBeInTheDocument();

    const permissions = screen.getByText(/signing in grants read-only access/i);
    for (const phrase of new Set(Object.values(BASE_GRANT_PHRASES))) {
      expect(permissions).toHaveTextContent(phrase);
    }
  });

  // The guard that matters. Asserting today's phrases appear would only
  // document the copy; this pins it to `esi/registry.ts`, which is where the
  // Base Grant actually comes from. The prose had already fallen behind —
  // it was silently omitting the mining ledger, blueprints, current location
  // and corporation roles — and an incomplete consent disclosure is the worst
  // defect this page can carry. Registering a new ungrouped endpoint now
  // fails here until someone decides how to disclose its scope.
  it('discloses every scope in the Base Grant, and nothing it no longer asks for', () => {
    expect(new Set(Object.keys(BASE_GRANT_PHRASES))).toEqual(new Set(SCOPES));
  });

  it('redirects to /characters when a Character already exists', async () => {
    await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
    renderLogin();
    expect(await screen.findByText('character list')).toBeInTheDocument();
  });

  it('shows a spinner on the SSO button while a login is pending', async () => {
    const user = userEvent.setup();
    renderLogin();
    const [firstButton] = await screen.findAllByRole('button', {
      name: /log in with eve online/i,
    });
    await user.click(firstButton);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);

    // The press starts an async chain — a Dexie read, then a `crypto.subtle`
    // PKCE digest — that ends in `assignLocation`. Asserting the spinner is
    // the whole point of this test, so it deliberately does not await that
    // chain's *effect*; but leaving it in flight makes it land during the
    // next test, after `beforeEach` has cleared the mock, and that test then
    // counts two navigations instead of one. Settling it here keeps the press
    // inside the test that made it — this was the intermittent
    // "expected 1, got 2" in `builds a PKCE authorize URL` below.
    await waitFor(() => expect(assignLocation).toHaveBeenCalledTimes(1));
  });

  it('builds a PKCE authorize URL and navigates to EVE SSO', async () => {
    const user = userEvent.setup();
    renderLogin();
    const [firstButton] = await screen.findAllByRole('button', {
      name: /log in with eve online/i,
    });
    await user.click(firstButton);

    await waitFor(() => expect(assignLocation).toHaveBeenCalledTimes(1));
    const url = new URL(vi.mocked(assignLocation).mock.calls[0][0]);

    expect(url.origin).toBe('https://login.eveonline.com');
    expect(url.pathname).toBe('/v2/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/callback$/);
  });
});
