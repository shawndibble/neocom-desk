import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
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
import {
  useCalendarCorpFilter,
  DEFAULT_CORP_FILTER,
} from '@/features/character/calendarCorpFilter';
import { CHARACTER_BOARD_ITEM_KINDS } from '@/engine/character/board';
import { Calendar } from '@/routes/Calendar';
import { renderPageRoute } from '@/test/renderPage';
import * as routeChunks from '@/app/routeChunks';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { exportRows } from '@/lib/downloadCsv';
import { stubViewport } from '@/test/viewport';

const { pinClock } = vi.hoisted(() => {
  const pinClock = () =>
    vi.useFakeTimers({
      now: new Date(2026, 5, 10, 9, 0),
      toFake: ['Date'],
      shouldAdvanceTime: true,
    });
  pinClock();
  return { pinClock };
});
beforeEach(() => {
  pinClock();
});

vi.mock('@/lib/downloadCsv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/downloadCsv')>()),
  exportRows: vi.fn(async () => {}),
}));

const sharedPops = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/sync/sharedPops', () => ({
  fetchSharedPops: async () => sharedPops.list,
}));

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
    http.get(`${ESI}/roles`, () => HttpResponse.json({ roles: [] })),
    http.get(`${ESI}/corporationhistory`, () => HttpResponse.json([])),
  ];
}

const server = mswServer(...baseHandlers());

function useNarrowViewport(): void {
  stubViewport(NARROW_QUERY);
}

function dayCells(): HTMLElement[] {
  return within(screen.getByRole('group', { name: /calendar map/i })).getAllByRole('button');
}

function dayLabelsWithLoad(): string[] {
  return dayCells()
    .map((cell) => cell.getAttribute('aria-label') ?? '')
    .filter((label) => label.includes('due:'));
}

const TICKER_DAYS = 14;

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useCalendarDensity.setState({ value: DEFAULT_CALENDAR_DENSITY, hydrated: false });
  useCalendarHiddenKinds.setState({ value: DEFAULT_HIDDEN_KINDS, hydrated: false });
  useCalendarCorpFilter.setState({ value: DEFAULT_CORP_FILTER, hydrated: false });
  sharedPops.list = [];

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

const CORP_ID = 98000001;
const CORP = 'https://esi.evetech.net/corporation';

async function grantCorpScopes(roles: string[]) {
  await db.tokens.update(CHAR_ID, {
    scopes: [
      'esi-calendar.read_calendar_events.v1',
      'esi-characters.read_corporation_roles.v1',
      'esi-industry.read_corporation_mining.v1',
    ],
  });
  server.use(
    http.get(ESI, () => HttpResponse.json({ corporation_id: CORP_ID })),
    http.get(`${ESI}/roles`, () => HttpResponse.json({ roles })),
    http.get(`https://esi.evetech.net/corporations/${CORP_ID}`, () =>
      HttpResponse.json({ name: 'Main Corp', ticker: 'MAIN' })
    ),
    http.get(`${CORP}/${CORP_ID}/mining/extractions`, () =>
      HttpResponse.json([
        {
          structure_id: 1001,
          moon_id: 40000001,
          extraction_start_time: TODAY.toISOString(),
          chunk_arrival_time: new Date(TODAY.getTime() + 6 * 3_600_000).toISOString(),
          natural_decay_time: new Date(TODAY.getTime() + 2 * 86_400_000).toISOString(),
        },
      ])
    )
  );
}

const ALT_ID = 92;
const ALT_CORP_ID = 98000002;
const ALT_ESI = `https://esi.evetech.net/characters/${ALT_ID}`;

async function addHoldingCorpDirector() {
  await db.characters.put({ characterId: ALT_ID, name: 'Alt Two', ownerHash: 'oh2', addedAt: 2 });
  await db.tokens.put({
    characterId: ALT_ID,
    accessToken: 'access-token-2',
    refreshToken: 'refresh-2',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-characters.read_corporation_roles.v1', 'esi-corporations.read_structures.v1'],
  });
  server.use(
    http.get(ALT_ESI, () => HttpResponse.json({ corporation_id: ALT_CORP_ID })),
    http.get(`${ALT_ESI}/roles`, () => HttpResponse.json({ roles: ['Station_Manager'] })),
    http.get(`${ALT_ESI}/corporationhistory`, () => HttpResponse.json([])),
    http.get(`https://esi.evetech.net/corporations/${ALT_CORP_ID}`, () =>
      HttpResponse.json({ name: 'Holding Two', ticker: 'HOLD2' })
    ),
    http.get(`https://esi.evetech.net/corporations/${ALT_CORP_ID}/structures`, () =>
      HttpResponse.json([
        {
          structure_id: 2001,
          corporation_id: ALT_CORP_ID,
          profile_id: 1,
          system_id: 30000142,
          type_id: 35832,
          name: 'Perimeter - Holding Astrahus',
          state: 'armor_reinforce',
          fuel_expires: inHours(30).toISOString(),
          state_timer_end: inHours(50).toISOString(),
        },
      ])
    )
  );
}

const renderCalendarRoute = () => renderPageRoute('/calendar', <Calendar />);

beforeAll(async () => {
  await Promise.all([import('@/app/App'), routeChunks.loadLayout(), routeChunks.loadCalendar()]);
}, 30_000);

describe('Calendar corporation events', () => {
  it('shows fuel-out and timer events of a corporation the active Character is not in', async () => {
    await addHoldingCorpDirector();
    renderCalendarRoute();

    const rail = await screen.findByRole('list', { name: /coming up/i });
    const rows = await within(rail).findAllByText('Perimeter - Holding Astrahus');
    expect(rows).toHaveLength(2);
    expect(within(rail).getByText(/Structure fuel · Holding Two/)).toBeInTheDocument();
    expect(
      within(rail).getByText(/Structure timers · armor reinforcement ends · Holding Two/)
    ).toBeInTheDocument();
  });

  it("hides them from the corporation filter, and keeps the pilot's own events", async () => {
    const user = userEvent.setup();
    await addHoldingCorpDirector();
    renderCalendarRoute();
    await screen.findAllByText('Perimeter - Holding Astrahus');

    await user.click(screen.getByRole('button', { name: /filter event types/i }));
    (await screen.findByRole('menuitem', { name: /corporation events/i })).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menuitemradio', { name: /hide corporation events/i });
    await user.keyboard('{End}{Enter}');

    await waitFor(() => expect(screen.queryByText('Perimeter - Holding Astrahus')).toBeNull());
    expect(screen.getByText('Fleet Op')).toBeInTheDocument();
  });

  it('offers no corporation filter when no corporation can be read', async () => {
    const user = userEvent.setup();
    renderCalendarRoute();
    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /filter event types/i }));
    expect(await screen.findByRole('menuitemcheckbox', { name: /calendar events/i })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /corporation events/i })).toBeNull();
    expect(screen.queryByRole('menuitemcheckbox', { name: /structure/i })).toBeNull();
  });
});

const SHARING_CORP_ID = 98000005;

function sharePop() {
  sharedPops.list = [
    {
      id: `${SHARING_CORP_ID}_x1`,
      extractionId: 'x1',
      moonId: 40000001,
      structureId: 1001,
      refineryName: 'Efa - Shared Tatara',
      solarSystemId: 30000142,
      popTime: 'ready',
      popAt: inHours(8).toISOString(),
      fractured: false,
      startedAt: inHours(-48).toISOString(),
      expiresAt: inHours(60).toISOString(),
      ore: null,
      notes: 'Fleet forms in local.',
      ratePct: 12,
      corporationId: SHARING_CORP_ID,
      syncedAt: null,
    },
  ];
  server.use(
    http.get('https://esi.evetech.net/universe/moons/40000001', () =>
      HttpResponse.json({ moon_id: 40000001, name: 'Efa I - Moon 1', system_id: 30000142 })
    ),
    http.get(`https://esi.evetech.net/corporations/${SHARING_CORP_ID}`, () =>
      HttpResponse.json({ name: 'Sharing Corp', ticker: 'SHARE' })
    )
  );
}

describe('Calendar Shared Pops', () => {
  it('shows a Shared Pop with its moon and sharing corporation', async () => {
    sharePop();
    renderCalendarRoute();

    const rail = await screen.findByRole('list', { name: /coming up/i });
    expect(await within(rail).findAllByText('Efa - Shared Tatara')).toHaveLength(1);
    expect(within(rail).queryByText('Efa I - Moon 1')).toBeNull();
    expect(within(rail).getByText(/Shared moon pops · ready/)).toBeInTheDocument();
    expect(within(rail).queryByText(/belt expires/)).toBeNull();
    expect(screen.getAllByText('Shared by Sharing Corp').length).toBeGreaterThan(0);
  });

  it('shows only the pop row when the corp also put the pop in the in-game calendar', async () => {
    sharePop();
    const duplicate = {
      event_id: 2,
      event_date: new Date(inHours(8).getTime() - 60_000).toISOString(),
      title: 'Efa Shared Tatara',
      importance: 0,
      event_response: 'not_responded' as const,
    };
    server.use(http.get(`${ESI}/calendar`, () => HttpResponse.json([...events, duplicate])));
    renderCalendarRoute();

    const rail = await screen.findByRole('list', { name: /coming up/i });
    expect(await within(rail).findAllByText('Efa - Shared Tatara')).toHaveLength(1);
    expect(within(rail).getByText('Fleet Op')).toBeInTheDocument();
    expect(within(rail).queryByText('Efa Shared Tatara')).toBeNull();
  });

  it('hides it when the pilot reads that moon from ESI', async () => {
    sharePop();
    await grantCorpScopes(['Station_Manager']);
    renderCalendarRoute();

    expect(await screen.findByText('Moon 40000001')).toBeInTheDocument();
    expect(screen.queryByText('Efa - Shared Tatara')).toBeNull();
  });

  it('opens the Shared Pop from ?pop=<id> with its Survey start link, leaving a clean URL', async () => {
    sharePop();
    window.history.pushState({}, '', `/calendar?pop=${SHARING_CORP_ID}_x1`);
    renderCalendarRoute();

    const dialog = await screen.findByRole('dialog', { name: 'Efa - Shared Tatara' });
    expect(within(dialog).getByText('Fleet forms in local.')).toBeInTheDocument();
    const link = within(dialog).getByRole('link', { name: /start a survey here/i });
    expect(link.getAttribute('href')).toBe(
      `/survey?place=Efa+-+Shared+Tatara&placeId=1001&payeeId=${SHARING_CORP_ID}&rate=12&pop=${SHARING_CORP_ID}_x1`
    );
    await waitFor(() => expect(window.location.search).not.toContain('pop='));
  });

  it("moves the map to the pop's day from ?pop=<id>, scoping the rail to it", async () => {
    sharePop();
    Object.assign(sharedPops.list[0] as object, {
      popAt: inHours(49 * 24).toISOString(),
      expiresAt: inHours(49 * 24 + 48).toISOString(),
    });
    window.history.pushState({}, '', `/calendar?pop=${SHARING_CORP_ID}_x1`);
    renderCalendarRoute();

    await screen.findByRole('dialog', { name: 'Efa - Shared Tatara' });
    expect(await screen.findByRole('button', { pressed: true })).toBeInTheDocument();
    const rail = screen.getByRole('list', { name: /coming up/i });
    expect(within(rail).getByText('Efa - Shared Tatara')).toBeInTheDocument();
    expect(within(rail).queryByText('Fleet Op')).toBeNull();
  });

  it('says a linked pop is no longer available when the pilot cannot see it', async () => {
    sharePop();
    window.history.pushState({}, '', `/calendar?pop=${SHARING_CORP_ID}_gone`);
    renderCalendarRoute();

    expect(await screen.findByText('This shared pop is no longer available')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(window.location.search).not.toContain('pop='));
  });
});

describe('Calendar', () => {
  it('puts a moon chunk on the board for a Character who can read extractions', async () => {
    await grantCorpScopes(['Station_Manager']);
    renderCalendarRoute();

    expect(await screen.findByText('Moon 40000001')).toBeInTheDocument();
    expect(screen.getByText(/arrives/i)).toBeInTheDocument();
  });

  it('asks for no extractions, and shows no moon-chunk row, without the corp role', async () => {
    const extractionRequests = vi.fn();
    await grantCorpScopes([]);
    server.use(
      http.get(`${CORP}/${CORP_ID}/mining/extractions`, () => {
        extractionRequests();
        return HttpResponse.json([]);
      })
    );
    renderCalendarRoute();

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /filter event types/i }));
    expect(await screen.findByRole('menuitemcheckbox', { name: /calendar events/i })).toBeVisible();
    expect(screen.queryByRole('menuitemcheckbox', { name: /moon chunks/i })).toBeNull();
    expect(extractionRequests).not.toHaveBeenCalled();
  });

  it('shows the calendar map and the coming-up rail together, at /calendar inside the shell', async () => {
    const { App } = await import('@/app/App');
    render(<App />);

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /calendar map/i })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /coming up/i })).toBeInTheDocument();
    const rail = (await screen.findAllByRole('navigation'))[0];
    const links = await within(rail).findAllByRole('link', { name: 'Calendar' });
    expect(links.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('keeps the shown month in the URL, and restores it on a fresh visit', async () => {
    const user = userEvent.setup();
    const { unmount } = renderCalendarRoute();
    await screen.findByText('Fleet Op');

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(window.location.search).toMatch(/anchor=\d{4}-\d{2}-\d{2}/));
    const monthLabel = screen.getByText(/^[A-Z][a-z]+ \d{4}$/);
    const shownMonth = monthLabel.textContent;

    unmount();
    renderCalendarRoute();
    await screen.findByText('Fleet Op');
    expect(screen.getByText(shownMonth as string)).toBeInTheDocument();
  });

  it('falls back to today rather than crashing on a garbage anchor value', async () => {
    window.history.pushState({}, '', '/calendar?anchor=not-a-date');
    renderCalendarRoute();
    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
  });

  it('merges another clock source into the same list', async () => {
    server.use(http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)));
    renderCalendarRoute();

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect((await screen.findAllByText(/industry jobs/i)).length).toBeGreaterThan(0);
  });

  it('names the kinds landing on a day, rather than a severity', async () => {
    server.use(http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)));
    renderCalendarRoute();

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(dayCells().length).toBeGreaterThan(TICKER_DAYS);
    const labels = dayLabelsWithLoad().join(' ');
    expect(labels).toContain('Calendar events');
    expect(labels).toContain('Industry jobs');
    expect(labels).not.toMatch(/\{\{|undefined/);
  });

  it('names the same kinds on the Day Ticker', async () => {
    useNarrowViewport();
    server.use(http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)));
    renderCalendarRoute();

    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(dayCells()).toHaveLength(TICKER_DAYS);
    const labels = dayLabelsWithLoad().join(' ');
    expect(labels).toContain('Calendar events');
    expect(labels).toContain('Industry jobs');
    expect(labels).not.toMatch(/\{\{|undefined/);
  });

  it('keeps rendering the other clocks when one source is forbidden', async () => {
    server.use(
      http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)),
      http.get(`${ESI}/calendar`, () => new HttpResponse(null, { status: 403 }))
    );
    renderCalendarRoute();

    expect((await screen.findAllByText(/industry jobs/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: /calendar map/i })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /coming up/i })).toBeInTheDocument();
    expect(screen.queryByText('Fleet Op')).not.toBeInTheDocument();
  });

  it('opens the event detail from ?open=<eventId>, leaving a clean URL', async () => {
    window.history.pushState({}, '', '/calendar?open=1');
    renderCalendarRoute();

    expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).not.toContain('open='));
  });

  it('opens the event detail from a calendar row', async () => {
    renderCalendarRoute();
    await userEvent.click(await screen.findByText('Fleet Op'));

    expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
  });

  it('reflects an RSVP in the rail without waiting for a refetch', async () => {
    server.use(http.put(`${ESI}/calendar/1/`, () => new HttpResponse(null, { status: 204 })));
    renderCalendarRoute();
    await userEvent.click(await screen.findByText('Fleet Op'));

    expect(screen.queryByText('Declined')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Decline' })).not.toBeDisabled());

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(await screen.findByText('Declined')).toBeInTheDocument();
  });

  it('lets a fresh reload override the earlier local RSVP once one arrives', async () => {
    server.use(http.put(`${ESI}/calendar/1/`, () => new HttpResponse(null, { status: 204 })));
    renderCalendarRoute();
    await userEvent.click(await screen.findByText('Fleet Op'));
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Decline' })).not.toBeDisabled());
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(await screen.findByText('Declined')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(screen.queryByText('Declined')).not.toBeInTheDocument());
  });

  it('hides a kind from the filter menu and remembers it', async () => {
    server.use(http.get(`${ESI}/industry/jobs`, () => HttpResponse.json(jobs)));
    renderCalendarRoute();
    expect((await screen.findAllByText(/industry jobs/i)).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /filter event types/i }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /industry jobs/i }));

    await waitFor(async () => {
      expect((await db.settings.get(CALENDAR_HIDDEN_KINDS_KEY))?.value).toEqual(['industryJob']);
    });
  });

  it("exports only the selected day's events, like the rail (issue #2840)", async () => {
    const later = {
      event_id: 2,
      event_date: inHours(24 * 5).toISOString(),
      title: 'Later Op',
      importance: 0,
      event_response: 'accepted' as const,
    };
    server.use(http.get(`${ESI}/calendar`, () => HttpResponse.json([...events, later])));
    vi.mocked(exportRows).mockClear();
    const user = userEvent.setup();
    renderCalendarRoute();
    expect(await screen.findByText('Later Op')).toBeInTheDocument();

    await user.click(
      dayCells().find((cell) => (cell.getAttribute('aria-label') ?? '').includes('due:'))!
    );
    await waitFor(() => expect(screen.queryByText('Later Op')).not.toBeInTheDocument());

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Calendar' }), {
      button: 0,
      pointerType: 'mouse',
    });
    (await screen.findByRole('menuitem', { name: 'Download CSV' })).focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(1));
    const rows = JSON.stringify(vi.mocked(exportRows).mock.calls[0][2]);
    expect(rows).toContain('Fleet Op');
    expect(rows).not.toContain('Later Op');
  });

  it('says so when every kind has been deselected', async () => {
    await db.settings.put({
      key: CALENDAR_HIDDEN_KINDS_KEY,
      value: [...CHARACTER_BOARD_ITEM_KINDS],
    });
    renderCalendarRoute();

    expect(await screen.findByText(/no event types selected/i)).toBeInTheDocument();
  });

  it('reports nothing coming up when every source reads fine and is empty', async () => {
    server.use(http.get(`${ESI}/calendar`, () => HttpResponse.json([])));
    renderCalendarRoute();

    expect(await screen.findByText(/nothing coming up/i)).toBeInTheDocument();
  });
});
