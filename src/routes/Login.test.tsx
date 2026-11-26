import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { SCOPES } from '@/esi/scopes';
import { assignLocation } from '@/app/navigation';
import { AUTHORIZED_APPS_URL, DISCORD_URL, REPO_URL, YOUTUBE_CHANNEL_URL } from '@/lib/links';
import { PLAY_STORE_PACKAGE } from '@/lib/playStoreApp';
import { LANDING_SHELL_ATTR, LANDING_SHELL_ID } from '@/app/landingShell';
import { takeLoginReturnTo } from '@/auth/loginReturnTo';
import { Login } from './Login';

vi.mock('@/app/navigation', () => ({ assignLocation: vi.fn() }));

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
  'esi-characters.read_contacts.v1': 'contacts',
  'esi-characters.read_loyalty.v1': 'loyalty points',
  'esi-characters.read_standings.v1': 'standings',
  'esi-location.read_location.v1': 'current location',
  'esi-location.read_ship_type.v1': 'the ship you are flying',
  'esi-fittings.read_fittings.v1': 'in-game fittings',
  'esi-characters.read_corporation_roles.v1': 'your corporation roles',
  'esi-wallet.read_corporation_wallets.v1': 'corporation wallets',
  'esi-corporations.read_divisions.v1': 'corporation divisions',
  'esi-corporations.read_corporation_membership.v1': 'corporation members',
  'esi-corporations.track_members.v1': 'corporation members',
  'esi-corporations.read_titles.v1': 'corporation titles',
  'esi-corporations.read_structures.v1': 'corporation structures',
  'esi-structures.read_corporation.v1': 'corporation structures',
  'esi-corporations.read_starbases.v1': 'corporation starbases',
  'esi-planets.read_customs_offices.v1': 'corporation customs offices',
  'esi-industry.read_corporation_mining.v1': 'corporation mining',
  'esi-industry.read_corporation_jobs.v1': 'corporation industry jobs',
  'esi-corporations.read_blueprints.v1': 'corporation blueprints',
  'esi-assets.read_corporation_assets.v1': 'corporation assets',
  'esi-contracts.read_corporation_contracts.v1': 'corporation contracts',
  'esi-markets.read_corporation_orders.v1': 'corporation market orders',
  'esi-corporations.read_projects.v1': 'corporation projects',
  'esi-markets.structure_markets.v1': 'player structure markets',
  'esi-characters.read_fatigue.v1': 'jump fatigue',
  'esi-killmails.read_killmails.v1': 'killmails',
  'esi-structures.read_character.v1': 'mercenary dens',
  'esi-activities.read_character.v1': 'mercenary dens',
  'esi.activity.char:read': 'Campaign Objectives you pressed Participate on',
};

const WRITE_SCOPE_PHRASES: Record<string, string> = {
  'esi-mail.organize_mail.v1': 'flags it as read in EVE',
  'esi-calendar.respond_calendar_events.v1': 'sends your response',
  'esi-mail.send_mail.v1': 'goes out through your account',
  'esi-fittings.write_fittings.v1': 'recreates it on the game',
  'esi-ui.write_waypoint.v1': 'replaces your autopilot waypoints in the client',
  'esi-ui.open_window.v1': 'opens a window in the client',
};

const BASE_GRANT_PHRASES: Record<string, string> = READ_ONLY_PHRASES;

function renderLogin(url: string | { pathname: string; state?: unknown } = '/login') {
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
  it('stashes the page the auth gate sent the visitor from', async () => {
    renderLogin({ pathname: '/login', state: { from: '/market/browser?info=123#x' } });
    await screen.findByRole('heading', { name: /everything you do outside the client/i });
    expect(takeLoginReturnTo()).toBe('/market/browser?info=123#x');
  });

  it.each([['//evil.com'], ['/login'], ['/callback?code=abc'], [42]])(
    'ignores an unusable from %j',
    async (from) => {
      renderLogin({ pathname: '/login', state: { from } });
      await screen.findByRole('heading', { name: /everything you do outside the client/i });
      expect(takeLoginReturnTo()).toBeNull();
    }
  );

  it('stashes nothing on a plain visit', async () => {
    renderLogin();
    await screen.findByRole('heading', { name: /everything you do outside the client/i });
    expect(takeLoginReturnTo()).toBeNull();
  });

  it('shows only logo, name and the sign-in button in the Play Store app', async () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(`android-app://${PLAY_STORE_PACKAGE}`);
    renderLogin();
    expect(await screen.findAllByRole('button', { name: /log in with eve online/i })).toHaveLength(
      1
    );
    expect(
      screen.queryByRole('heading', { name: /everything you do outside the client/i })
    ).toBeNull();
    expect(screen.getByRole('heading', { name: 'Neocom Desk' })).toBeInTheDocument();
    expect(screen.queryByText(/everything logging in grants/i)).toBeNull();
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
      await screen.findByRole('heading', { name: /everything you do outside the client/i });
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
        name: /everything you do outside the client/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
    await screen.findByRole('contentinfo');
    const buttons = screen.getAllByRole('button', { name: /log in with eve online/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes banner and contentinfo landmarks and hides decorative icons', async () => {
    const { container } = renderLogin();
    await screen.findByRole('contentinfo');

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

  it('leads with the areas of the app, each question under its job', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /one desk for every job you do in eve/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /cheapest one without crossing lowsec/i })
    ).toBeInTheDocument();
  });

  it('gives the screenshot alt text and loads it lazily', async () => {
    renderLogin();
    const areas = within(
      await screen.findByRole('region', { name: /one desk for every job you do in eve/i })
    );
    const image = within(areas.getByRole('tabpanel')).getByRole('img');
    expect(image.getAttribute('alt')).toBeTruthy();
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image.getAttribute('src')).toMatch(/^\/screenshots\/[a-z-]+\.webp$/);
  });

  it('enlarges a screenshot in a dialog when it is clicked', async () => {
    const user = userEvent.setup();
    renderLogin();
    const areas = within(
      await screen.findByRole('region', { name: /one desk for every job you do in eve/i })
    );
    await user.click(areas.getByRole('button', { name: /enlarge: the market page/i }));
    const dialog = await screen.findByRole('dialog', { name: /a live order book/i });
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      '/screenshots/desktop-market.webp'
    );
  });

  it('tabs the feature catalog by job and names every surface that ships today', async () => {
    renderLogin();
    const section = within(
      await screen.findByRole('region', { name: /one desk for every job you do in eve/i })
    );
    const user = userEvent.setup();

    const covered: Record<string, string[]> = {
      Trade: ['Market', 'Open Orders', 'Wallet', 'Assets', 'Contracts'],
      Build: ['Industry', 'Mining', 'Planetary Industry'],
      Fly: ['Skills', 'Ships', 'Clones', 'Travel'],
      'Run a corp': ['Corporation', 'Corp Tax Book', 'SRP', 'Communities'],
      'Stay in touch': ['Mail & Calendar', 'Contacts & Standings'],
    };
    for (const [tab, pages] of Object.entries(covered)) {
      await user.click(section.getByRole('tab', { name: tab }));
      const panel = within(section.getByRole('tabpanel'));
      for (const page of pages) expect(panel.getByText(page)).toBeInTheDocument();
    }
  });

  it('has no How it works section or header link any more', async () => {
    renderLogin();
    await screen.findByRole('region', { name: /one desk for every job you do in eve/i });
    expect(screen.queryByRole('region', { name: /how it works/i })).toBeNull();
    expect(
      within(screen.getByRole('navigation', { name: /page sections/i })).queryByRole('link', {
        name: 'How it works',
      })
    ).toBeNull();
  });

  it('numbers the sections as the header lists them, Areas first', async () => {
    renderLogin();
    await screen.findByRole('contentinfo');
    const nav = within(screen.getByRole('navigation', { name: /page sections/i }));
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Areas',
      'Away',
      'Tour',
      'Trust',
      'Community',
      'FAQ',
    ]);
    expect(screen.getByText('01 · Areas')).toBeInTheDocument();
    expect(screen.getByText('06 · FAQ')).toBeInTheDocument();
  });

  it('sells the whole app in the hero and under it', async () => {
    renderLogin();
    await screen.findByRole('contentinfo');
    expect(screen.getByText(/one desk beside the game for every character you fly/i)).toBeVisible();
    expect(screen.getByRole('list', { name: 'At a glance' })).toBeInTheDocument();
    expect(screen.getByText('Industry · PI · Corp')).toBeInTheDocument();
    expect(screen.getByText('Alerts · game closed')).toBeInTheDocument();
  });

  it('shows the alerts section and the tour with its more-videos link', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /it keeps watching while eve is closed/i })
    ).toBeInTheDocument();
    const tour = within(screen.getByRole('region', { name: /watch it work/i }));
    expect(tour.getByRole('button', { name: /watch the full tour \(5:40\)/i })).toBeInTheDocument();
    expect(tour.getByRole('link', { name: /more walkthroughs on youtube/i })).toHaveAttribute(
      'href',
      YOUTUBE_CHANNEL_URL
    );
  });

  it('renders no unresolved i18n keys anywhere on the page', async () => {
    const { container } = renderLogin();
    await screen.findByRole('contentinfo');

    const leaked = (container.textContent ?? '').match(
      /(?:overview|login|skills|notifications|common|nav|settings|market|industry)\.[a-zA-Z][\w.]*/g
    );
    expect(leaked ?? []).toEqual([]);
  });

  it('answers the trust objections and enumerates the scopes it asks for', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /what it can touch, and what it can't/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /it writes only when you act/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /your login stays on this device/i })
    ).toBeInTheDocument();

    const trust = within(screen.getByRole('region', { name: /what it can touch/i }));
    expect(trust.getByText(/everything logging in grants/i)).toBeInTheDocument();
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
      '5 permissions'
    );
  });

  it('opens an area to list its permissions with their captions', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: /industry & planets/i }));
    expect(screen.getByText('Your mining ledger.')).toBeInTheDocument();
    expect(screen.getByText('Your planetary colonies.')).toBeInTheDocument();
  });

  it('keeps the planetary-scope note, the one-login note and the revoke link', async () => {
    renderLogin();
    const trust = within(await screen.findByRole('region', { name: /what it can touch/i }));
    expect(trust.getByText(/manage your planetary installations/i)).toHaveTextContent(
      /only reads that data and never writes/i
    );
    expect(trust.getByText(/asks for every read above at once/i)).toHaveTextContent(
      /log in with custom permissions/i
    );
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
    const trust = within(await screen.findByRole('region', { name: /what it can touch/i }));
    expect(trust.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy.html'
    );
  });

  it('never calls the app read-only, since the Base Grant carries write scopes', async () => {
    const { container } = renderLogin();
    await screen.findByRole('contentinfo');
    expect(container.textContent ?? '').not.toMatch(
      /read-only access|it never writes|read-only, and/i
    );
  });

  it('discloses each write scope in the trust card, not the read sentence', async () => {
    renderLogin();
    await screen.findByRole('heading', { name: /it writes only when you act/i });

    const permissions = screen.getByText(/everything logging in grants/i);
    for (const phrase of Object.values(WRITE_SCOPE_PHRASES)) {
      expect(permissions).not.toHaveTextContent(phrase);
      expect(screen.getByText(new RegExp(phrase, 'i'))).toBeInTheDocument();
    }
  });

  it('discloses every scope in the Base Grant, and nothing it no longer asks for', () => {
    expect(new Set(Object.keys(BASE_GRANT_PHRASES))).toEqual(new Set(SCOPES));
    for (const scope of Object.keys(WRITE_SCOPE_PHRASES)) expect(SCOPES).not.toContain(scope);
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
