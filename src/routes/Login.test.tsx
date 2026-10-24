import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { SCOPES } from '@/esi/scopes';
import { assignLocation } from '@/app/navigation';
import { AUTHORIZED_APPS_URL, DISCORD_URL, REPO_URL } from '@/lib/links';
import { PLAY_STORE_PACKAGE } from '@/lib/playStoreApp';
import { LANDING_SHELL_ATTR, LANDING_SHELL_ID } from '@/app/landingShell';
import { Login } from './Login';

vi.mock('@/app/navigation', () => ({ assignLocation: vi.fn() }));

/**
 * Every read scope in the Base Grant, against the words that disclose it.
 * The scopes accordion's own coverage is pinned in `scopeGroups.test.ts`; this
 * map stays hand-maintained on purpose: only a person can decide how
 * a new scope should be described to someone deciding whether to grant it.
 * Two scopes may share a phrase where the disclosure honestly is the same
 * (`read_clones`/`read_implants`), but a scope may never be absent.
 */
const READ_ONLY_PHRASES: Record<string, string> = {
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
  'esi-planets.manage_planets.v1': 'planetary colonies',
  'esi-structures.read_character.v1': 'Mercenary Dens',
  'esi-activities.read_character.v1': 'Mercenary Dens',
  'esi-characters.read_contacts.v1': 'contacts',
  'esi-characters.read_loyalty.v1': 'loyalty points',
  'esi-characters.read_standings.v1': 'standings',
  'esi-location.read_location.v1': 'current location',
  'esi-location.read_ship_type.v1': 'the ship you are flying',
  'esi-fittings.read_fittings.v1': 'in-game fittings',
};

/** The Base Grant scopes that are writes, not reads — their disclosure goes in the "Six writes" trust card, not the read sentence, which it would otherwise contradict. */
const WRITE_SCOPE_PHRASES: Record<string, string> = {
  'esi-mail.organize_mail.v1': 'flags it as read in EVE',
  'esi-calendar.respond_calendar_events.v1': 'sends your response',
  'esi-mail.send_mail.v1': 'goes out through your account',
  'esi-fittings.write_fittings.v1': 'recreates it on the game',
  'esi-ui.write_waypoint.v1': 'replaces your autopilot waypoints in the client',
  'esi-ui.open_window.v1': 'opens a window in the client',
};

const BASE_GRANT_PHRASES: Record<string, string> = {
  ...READ_ONLY_PHRASES,
  ...WRITE_SCOPE_PHRASES,
};

function renderLogin(url = '/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/characters" element={<p>character list</p>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

beforeEach(async () => {
  vi.mocked(assignLocation).mockClear();
  vi.stubEnv('VITE_EVE_CLIENT_ID', 'test-client-id');
  sessionStorage.clear();
  await db.characters.clear();
  await db.settings.clear();
});

describe('Login', () => {
  it('shows only logo, name and the sign-in button in the Play Store app', async () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(`android-app://${PLAY_STORE_PACKAGE}`);
    renderLogin();
    expect(await screen.findAllByRole('button', { name: /log in with eve online/i })).toHaveLength(
      1
    );
    expect(screen.queryByRole('heading', { name: /answers, not api dumps/i })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Neocom Desk' })).toBeInTheDocument();
    expect(screen.queryByText(/logging in lets it read/i)).toBeNull();
    expect(
      screen.getByRole('button', { name: /log in with custom permissions/i })
    ).toBeInTheDocument();
  });

  it('lets the prerendered hero go once it renders its own', async () => {
    const shell = document.createElement('div');
    shell.id = LANDING_SHELL_ID;
    document.body.append(shell);
    document.documentElement.setAttribute(LANDING_SHELL_ATTR, '');
    try {
      renderLogin();
      expect(document.getElementById(LANDING_SHELL_ID)).not.toBeNull();
      await screen.findByRole('heading', { name: /answers, not api dumps/i });
      expect(document.getElementById(LANDING_SHELL_ID)).toBeNull();
      expect(document.documentElement.hasAttribute(LANDING_SHELL_ATTR)).toBe(false);
    } finally {
      shell.remove();
      document.documentElement.removeAttribute(LANDING_SHELL_ATTR);
    }
  });

  it('shows the app name, hero heading and SSO button', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', {
        name: /answers, not api dumps/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
    // The closing call to action mounts just after the hero (`useBelowFold`).
    await screen.findByRole('contentinfo');
    const buttons = screen.getAllByRole('button', { name: /log in with eve online/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes banner and contentinfo landmarks and hides decorative icons', async () => {
    const { container } = renderLogin();
    await screen.findByRole('contentinfo');

    // Panel headers match 'banner' in jsdom; only a header outside <main> is one in a browser.
    const main = container.querySelector('main');
    expect(screen.getAllByRole('banner').some((el) => !main?.contains(el))).toBe(true);
    expect(screen.getByRole('contentinfo')).not.toBeNull();
    expect(main?.contains(screen.getByRole('contentinfo'))).toBe(false);
    expect(container.querySelectorAll('main svg:not([aria-hidden])')).toHaveLength(0);
  });

  it('links the footer "Free & open source" text to the repo', async () => {
    renderLogin();
    expect(await screen.findByRole('link', { name: /free & open source/i })).toHaveAttribute(
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
      screen.getByRole('heading', { name: /which order is quietly losing isk/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /is this blueprint worth building/i })
    ).toBeInTheDocument();
  });

  it('pairs every question with a screenshot, each with alt text, lazily loaded', async () => {
    renderLogin();
    const grid = within(
      await screen.findByRole('region', { name: /the questions it exists to answer/i })
    );
    const images = grid.getAllByRole('img');
    // One capture per tile, and one tile per heading.
    expect(images).toHaveLength(grid.getAllByRole('heading', { level: 3 }).length);
    expect(images).toHaveLength(11);
    expect(new Set(images.map((image) => image.getAttribute('src'))).size).toBe(11);
    for (const image of images) {
      expect(image.getAttribute('alt')).toBeTruthy();
      expect(image).toHaveAttribute('loading', 'lazy');
      expect(image.getAttribute('src')).toMatch(/^\/screenshots\/[a-z-]+\.webp$/);
    }
  });

  it('enlarges a screenshot in a dialog when it is clicked', async () => {
    const user = userEvent.setup();
    renderLogin();
    // The features showcase opens on the same capture, so scope to the questions grid.
    const grid = within(
      await screen.findByRole('region', { name: /the questions it exists to answer/i })
    );
    await user.click(grid.getByRole('button', { name: /enlarge: a build plan for an orca/i }));
    const dialog = await screen.findByRole('dialog', { name: /build plans with profit/i });
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      '/screenshots/desktop-build-plan.webp'
    );
  });

  // The catalog is the page's claim about what shipped, and it silently rotted
  // once before: the eight rows it listed predated Moon Mining, Corporation,
  // Notifications and the Open Orders worklist. This pins the rows that exist,
  // so renaming or dropping one becomes a deliberate two-file edit instead of
  // a silent drift. It deliberately does NOT catch the failure that caused the
  // rot — a new route shipping with no row here still fails nothing, because
  // nothing enumerates the app's routes and not every route earns a row. The
  // consent list below is the half that *can* be derived, and is.
  it('tabs the feature catalog by area and names every surface that ships today', async () => {
    renderLogin();
    // Scoped to the section: "Clones" and "Market" also appear in the hero's
    // preview panel, so an unscoped query matches two nodes.
    const section = within(
      await screen.findByRole('region', { name: /everything outside the client/i })
    );
    const user = userEvent.setup();

    // Each feature is a tab's own name or an "Also includes" chip in that tab's panel.
    // A chip that only repeats its tab's name (Industry, Corporation, Alerts) is not shown.
    const covered: Record<string, string[]> = {
      Industry: [],
      'Market & orders': ['Market', 'Open Orders', 'Wallet', 'Assets'],
      Skills: ['Ships', 'Clones', 'Travel'],
      'Planetary & mining': ['Planetary Industry', 'Mining'],
      Corporation: ['Corp Tax Book', 'SRP'],
      Mail: ['Mail & Calendar', 'Contracts', 'Contacts & Standings', 'Communities'],
      Alerts: ['Notifications'],
    };
    const seen: string[] = [];
    for (const [tab, features] of Object.entries(covered)) {
      await user.click(section.getByRole('tab', { name: tab }));
      const panel = within(section.getByRole('tabpanel'));
      for (const feature of features) {
        expect(panel.getByText(feature)).toBeInTheDocument();
        seen.push(feature);
      }
      if (features.length === 0) expect(panel.queryByText('Also includes')).toBeNull();
      else expect(panel.getByText('Also includes')).toBeInTheDocument();
      // The tab's own name is never repeated as a chip.
      expect(panel.queryByRole('listitem', { name: tab })).toBeNull();
      seen.push(tab);
    }
    // 16 chips; the other 4 catalog rows (Industry, Corporation, Alerts, Skills) are named by their tab.
    expect(seen.filter((name) => !(name in covered))).toHaveLength(16);
    for (const row of ['Industry', 'Corporation', 'Alerts', 'Skills']) expect(seen).toContain(row);
  });

  it('has no How it works section or header link any more', async () => {
    renderLogin();
    await screen.findByRole('region', { name: /the questions it exists to answer/i });
    expect(screen.queryByRole('region', { name: /how it works/i })).toBeNull();
    expect(
      within(screen.getByRole('navigation', { name: /page sections/i })).queryByRole('link', {
        name: 'How it works',
      })
    ).toBeNull();
  });

  /*
   * The hero preview is a mockup of the Overview, and it rotted silently
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
  it("previews the Overview widget grid using the widgets' own labels", async () => {
    renderLogin();
    const preview = within(await screen.findByRole('group', { name: /logged-in view/i }));

    // The header row: the Next deadline button and the alerts bell with its count.
    expect(preview.getByText('Next')).toBeInTheDocument();
    expect(preview.getByText('Customize')).toBeInTheDocument();
    expect(preview.getByRole('button', { name: /alerts, 5 waiting/i })).toBeInTheDocument();

    // The grid: the app's own Widgets, loaded as a chunk of their own, each titled as the real one is.
    for (const title of [
      'Mining tax',
      'Contracts',
      'Mail',
      'Location and ship',
      'Coming up',
      'Wallet',
      'Mining survey',
      'Wallet flow',
      'Training',
      'Open orders',
    ]) {
      expect(await preview.findByRole('region', { name: title })).toBeInTheDocument();
    }
    expect(preview.getByText('1 outstanding')).toBeInTheDocument();
    expect(preview.getByRole('button', { name: /data updated/i })).toBeInTheDocument();

    // The fixed board is gone: no summary strip cells, no folded alerts row.
    expect(preview.queryByText('Training now')).not.toBeInTheDocument();
    expect(preview.queryByText('13 unread')).not.toBeInTheDocument();
  });

  it('opens sample alerts from the demo bell, and the demo links nowhere', async () => {
    const user = userEvent.setup();
    renderLogin();
    const preview = within(await screen.findByRole('group', { name: /logged-in view/i }));

    await user.click(preview.getByRole('button', { name: /alerts, 5 waiting/i }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Order undercut')).toBeInTheDocument();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(5);

    // A signed-out visitor cannot reach any page the real Widgets link to.
    expect(preview.queryAllByRole('link')).toHaveLength(0);
  });

  it('renders no unresolved i18n keys anywhere on the page', async () => {
    const { container } = renderLogin();
    await screen.findByRole('group', { name: /logged-in view/i });

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
      await screen.findByRole('heading', { name: /it writes only when you act/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /six writes, and nothing else/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /your login stays on this device/i })
    ).toBeInTheDocument();

    const trust = within(screen.getByRole('region', { name: /it writes only when you act/i }));
    expect(trust.getByText(/logging in lets it read/i)).toBeInTheDocument();
    for (const name of [
      /skills & clones/i,
      /money & market/i,
      /industry & planets/i,
      /social & calendar/i,
      /location & ships/i,
      /^structures/i,
    ]) {
      expect(trust.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(trust.getByRole('button', { name: /money & market/i })).toHaveTextContent(
      '4 permissions'
    );
  });

  it('opens an area to list its permissions with their captions', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: /industry & planets/i }));
    expect(screen.getByText('Your mining ledger.')).toBeInTheDocument();
    expect(screen.getByText('Your planetary colonies and Mercenary Dens.')).toBeInTheDocument();
  });

  it('keeps the planetary-scope note, the separate-grants note and the revoke link', async () => {
    renderLogin();
    const trust = within(
      await screen.findByRole('region', { name: /it writes only when you act/i })
    );
    expect(trust.getByText(/manage your planetary installations/i)).toHaveTextContent(
      /only reads that data and never writes/i
    );
    expect(trust.getByText(/player-structure markets are separate grants/i)).toBeInTheDocument();
    expect(trust.getByRole('link', { name: /authorized apps page/i })).toHaveAttribute(
      'href',
      AUTHORIZED_APPS_URL
    );
    expect(trust.getByRole('link', { name: /view the source on github/i })).toHaveAttribute(
      'href',
      REPO_URL
    );
  });

  it('puts a Discord section and a FAQ after trust, with FAQ links to public pages only', async () => {
    const user = userEvent.setup();
    renderLogin();
    const community = within(await screen.findByRole('region', { name: /bugs, ideas and chat/i }));
    expect(community.getByRole('link', { name: /join discord/i })).toHaveAttribute(
      'href',
      DISCORD_URL
    );
    expect(community.queryByRole('figure')).not.toBeInTheDocument();

    const faq = within(screen.getByRole('region', { name: /quick answers/i }));
    await user.click(faq.getByRole('button', { name: /move isk or change anything/i }));
    expect(faq.getByRole('link', { name: /read more/i })).toHaveAttribute(
      'href',
      '/privacy.html#writes'
    );
    for (const link of faq.queryAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/^\/help/);
    }
  });

  it('scrolls a cold load straight to the section its hash names', async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    // The hook reads the hash off the address bar, as BrowserRouter's would be.
    window.history.replaceState({}, '', '/login#login-faq');
    try {
      renderLogin('/login#login-faq');
      const faq = await screen.findByRole('region', { name: /quick answers/i });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(faq);
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('links the permissions note to the privacy policy', async () => {
    renderLogin();
    const trust = within(
      await screen.findByRole('region', { name: /it writes only when you act/i })
    );
    expect(trust.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy.html'
    );
  });

  it('never calls the app read-only, since the Base Grant carries write scopes', async () => {
    const { container } = renderLogin();
    await screen.findByRole('group', { name: /logged-in view/i });
    expect(container.textContent ?? '').not.toMatch(
      /read-only access|it never writes|read-only, and/i
    );
  });

  it('discloses each write scope in the trust card, not the read sentence', async () => {
    renderLogin();
    await screen.findByRole('heading', { name: /it writes only when you act/i });

    const permissions = screen.getByText(/logging in lets it read/i);
    for (const phrase of Object.values(WRITE_SCOPE_PHRASES)) {
      expect(permissions).not.toHaveTextContent(phrase);
      expect(screen.getByText(new RegExp(phrase, 'i'))).toBeInTheDocument();
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

  it('adds a header login button, wired like the hero one, once the hero login button is out of view', async () => {
    const user = userEvent.setup();
    type Entry = { target: Element; isIntersecting: boolean };
    let report: (entries: Entry[]) => void = () => {};
    const observed: Element[] = [];
    let captured = false;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof report) {
          // The header's observer is the first one built; the reveal and demo
          // observers constructed after it must not replace it.
          if (!captured) report = cb;
          captured = true;
          this.mine = report === cb;
        }
        mine = false;
        observe(el: Element) {
          if (this.mine) observed.push(el);
        }
        disconnect() {}
      }
    );
    try {
      renderLogin();
      const name = { name: /log in with eve online/i };
      await screen.findByRole('contentinfo');
      const before = screen.getAllByRole('button', name).length;
      // Only the hero's wrapper is watched: the closing call to action does not hide the header's button.
      expect(observed).toHaveLength(1);
      expect(within(screen.getByRole('banner')).queryByRole('button', name)).toBeNull();
      act(() => report([{ target: observed[0], isIntersecting: false }]));
      const header = within(screen.getByRole('banner'));
      await user.click(header.getByRole('button', name));
      expect(screen.getAllByRole('button', name)).toHaveLength(before + 1);
      await waitFor(() => expect(assignLocation).toHaveBeenCalledTimes(1));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens the custom permissions dialog from the link under the login button (#1522)', async () => {
    const user = userEvent.setup();
    renderLogin();
    const [firstLink] = await screen.findAllByRole('button', {
      name: /log in with custom permissions/i,
    });
    await user.click(firstLink);

    const dialog = await screen.findByRole('dialog', { name: /log in with custom permissions/i });
    expect(within(dialog).getByRole('checkbox', { name: 'Wallet' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /skills & skill queue/i })).toBeDisabled();
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
