import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByRole('grid', { name: /calendar map/i })).toBeInTheDocument();
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
    expect(screen.getByRole('grid', { name: /calendar map/i })).toBeInTheDocument();
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
