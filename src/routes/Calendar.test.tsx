import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import {
  useCalendarDensity,
  DEFAULT_CALENDAR_DENSITY,
} from '@/features/character/calendarViewPref';
import {
  useCalendarHiddenKinds,
  DEFAULT_HIDDEN_KINDS,
  CALENDAR_HIDDEN_KINDS_KEY,
} from '@/features/character/calendarKindFilter';
import { App } from '@/app/App';
import { NARROW_QUERY } from '@/lib/useIsNarrow';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const ESI = `https://esi.evetech.net/characters/${CHAR_ID}`;

/**
 * Anchored to "today" rather than to a fixed date, so a fixture always lands
 * inside the visible grid and inside the board's own horizon whenever the
 * suite actually runs.
 */
const TODAY = new Date();
const inHours = (hours: number) =>
  new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), TODAY.getHours() + hours);

const EVENT_DATE = inHours(3);
const JOB_END = inHours(5);

const events = [
  {
    event_id: 1,
    event_date: EVENT_DATE.toISOString(),
    title: 'Fleet Op',
    importance: 1,
    event_response: 'accepted' as const,
  },
];

const jobs = [
  {
    job_id: 7,
    activity_id: 1,
    blueprint_type_id: 1000,
    facility_id: 60003760,
    station_id: 60003760,
    runs: 10,
    start_date: TODAY.toISOString(),
    end_date: JOB_END.toISOString(),
    status: 'active' as const,
    product_type_id: 2454,
  },
];

/**
 * Every source the page reads, all empty. A test that cares about one source
 * overrides just that handler with `server.use` — msw resolves with the FIRST
 * match, so an override must stand alone rather than follow a re-spread of
 * these.
 */
function baseHandlers() {
  return [
    http.get(`${ESI}/calendar`, () => HttpResponse.json(events)),
    http.get(`${ESI}/calendar/1`, () =>
      HttpResponse.json({
        event_id: 1,
        title: 'Fleet Op',
        date: EVENT_DATE.toISOString(),
        duration: 60,
        importance: 1,
        owner_id: 1,
        owner_name: 'FC',
        owner_type: 'character',
        response: 'accepted',
        text: 'Bring your ship',
      })
    ),
    http.get(`${ESI}/skillqueue`, () => HttpResponse.json([])),
    http.get(`${ESI}/industry/jobs`, () => HttpResponse.json([])),
    http.get(`${ESI}/planets`, () => HttpResponse.json([])),
    http.get(`${ESI}/contracts`, () => HttpResponse.json([])),
    http.get(`${ESI}/orders`, () => HttpResponse.json([])),
    http.post('https://esi.evetech.net/universe/names', () => HttpResponse.json([])),
    // The shell's corp nav asks for these on every route; unrelated to the
    // page, but `onUnhandledRequest: 'error'` counts them.
    http.get(`${ESI}/roles`, () => HttpResponse.json({ roles: [] })),
    http.get(`${ESI}/corporationhistory`, () => HttpResponse.json([])),
  ];
}

const server = setupServer(...baseHandlers());

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
/**
 * `vitest.setup.ts` stubs `matchMedia` to never match, and `useIsNarrow` is
 * phrased as a max-width so that reads as "wide" — so every test here renders
 * the Calendar Map unless it calls this, which flips the page to its Day
 * Ticker branch. Same shape as `FilterBar.test.tsx`.
 */
let restoreMatchMedia: (() => void) | undefined;

function useNarrowViewport(): void {
  const real = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: media === NARROW_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  restoreMatchMedia = () => {
    window.matchMedia = real;
  };
}

afterEach(() => {
  restoreMatchMedia?.();
  restoreMatchMedia = undefined;
});

/**
 * Every day cell's accessible name that reports a load, from whichever of the
 * two surfaces rendered — the Calendar Map and the Day Ticker deliberately
 * publish the same group name, so this reads either one.
 */
function dayCells(): HTMLElement[] {
  return within(screen.getByRole('group', { name: /calendar map/i })).getAllByRole('button');
}

function dayLabelsWithLoad(): string[] {
  return dayCells()
    .map((cell) => cell.getAttribute('aria-label') ?? '')
    .filter((label) => label.includes('due:'));
}

/** The Day Ticker's fixed span — `TICKER_DAYS` in the route, a fortnight. */
const TICKER_DAYS = 14;

afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useCalendarDensity.setState({ value: DEFAULT_CALENDAR_DENSITY, hydrated: false });
  useCalendarHiddenKinds.setState({ value: DEFAULT_HIDDEN_KINDS, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-calendar.read_calendar_events.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/calendar');
});

describe('Calendar', () => {
  it('shows the calendar map and the coming-up rail together', async () => {
    render(<App />);

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /calendar map/i })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /coming up/i })).toBeInTheDocument();
  });

  /** The redesign's whole premise: the rail is not a calendar feed, it is every clock. */
  it('merges another clock source into the same list', async () => {
    server.use(http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)));
    render(<App />);

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(await screen.findByText(/industry jobs/i)).toBeInTheDocument();
  });

  /**
   * The map's dots are pure colour, so a day cell's accessible name is the
   * only thing that says which kinds landed on it (DESIGN.md §7) — and since
   * the colour now means kind rather than urgency, naming a severity there
   * would describe a signal the page no longer paints.
   *
   * This one is the wide branch: the stubbed `matchMedia` never matches, so
   * the Calendar Map renders. The Day Ticker gets its own test below.
   *
   * The `{{`/`undefined` assertion is the point of the test: an interpolation
   * renamed on one side only does not throw, it just ships a placeholder into
   * a name nobody sighted will ever read.
   */
  it('names the kinds landing on a day, rather than a severity', async () => {
    server.use(http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)));
    render(<App />);

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    // A month of cells, which is what proves this is the grid and not the ticker.
    expect(dayCells().length).toBeGreaterThan(TICKER_DAYS);
    // Both seeded kinds, joined across days: the two fixtures are hours apart
    // and may straddle midnight, so which cell each lands in is not the point
    // — that every kind present is named is.
    const labels = dayLabelsWithLoad().join(' ');
    expect(labels).toContain('Calendar events');
    expect(labels).toContain('Industry jobs');
    expect(labels).not.toMatch(/\{\{|undefined/);
  });

  /**
   * The same assertion against the phone's branch, which the wide test above
   * cannot reach: both surfaces publish the identical `calendar.map.label`
   * group name, so a test that does not force the viewport silently exercises
   * only the map. `/simplify` caught the Day Ticker being fed the wrong grid
   * once already — that class of bug hides behind exactly this shared label.
   */
  it('names the same kinds on the Day Ticker', async () => {
    useNarrowViewport();
    server.use(http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)));
    render(<App />);

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    // Exactly a fortnight of columns — the ticker, not the grid.
    expect(dayCells()).toHaveLength(TICKER_DAYS);
    const labels = dayLabelsWithLoad().join(' ');
    expect(labels).toContain('Calendar events');
    expect(labels).toContain('Industry jobs');
    expect(labels).not.toMatch(/\{\{|undefined/);
  });

  /**
   * The acceptance test for the whole redesign. `/calendar` used to be
   * scope-gated as a whole and rendered a page-wide re-login banner, so one
   * revoked scope blanked everything. With six sources that is no longer
   * defensible — the five that still read must still render.
   *
   * The shell's own `AuthFailureNotice` still appears, and should: it is a
   * app-wide "one of your reads was refused" notice sitting above the outlet,
   * not the route replacing its own content. What this pins is that the route
   * keeps both panes and drops only the forbidden source's rows.
   */
  it('keeps rendering the other clocks when one source is forbidden', async () => {
    server.use(
      http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)),
      http.get(`${ESI}/calendar`, () => new HttpResponse(null, { status: 403 }))
    );
    render(<App />);

    // The industry job still arrives...
    expect(await screen.findByText(/industry jobs/i)).toBeInTheDocument();
    // ...both panes are still on screen rather than replaced by a banner...
    expect(screen.getByRole('group', { name: /calendar map/i })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /coming up/i })).toBeInTheDocument();
    // ...and only the forbidden source's own rows are missing.
    expect(screen.queryByText('Fleet Op')).not.toBeInTheDocument();
  });

  it('opens the event detail from a calendar row', async () => {
    render(<App />);
    await userEvent.click(await screen.findByText('Fleet Op'));

    expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
  });

  it('hides a kind from the filter menu and remembers it', async () => {
    server.use(http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)));
    render(<App />);
    expect(await screen.findByText(/industry jobs/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /filter event types/i }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /industry jobs/i }));

    await waitFor(async () => {
      expect((await db.settings.get(CALENDAR_HIDDEN_KINDS_KEY))?.value).toEqual(['industryJob']);
    });
  });

  it('says so when every kind has been deselected', async () => {
    await db.settings.put({
      key: CALENDAR_HIDDEN_KINDS_KEY,
      value: [
        'calendarEvent',
        'skillTraining',
        'industryJob',
        'planetExtraction',
        'contractExpiry',
        'orderExpiry',
      ],
    });
    render(<App />);

    expect(await screen.findByText(/no event types selected/i)).toBeInTheDocument();
  });

  it('reports nothing coming up when every source reads fine and is empty', async () => {
    server.use(http.get(`${ESI}/calendar`, () => HttpResponse.json([])));
    render(<App />);

    expect(await screen.findByText(/nothing coming up/i)).toBeInTheDocument();
  });
});
