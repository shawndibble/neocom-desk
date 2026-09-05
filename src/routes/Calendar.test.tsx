import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useCalendarView, DEFAULT_CALENDAR_VIEW } from '@/features/character/calendarViewPref';
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

// Anchored to "today" (not a fixed date) so the fixture always lands inside
// the default Month view's visible grid, whenever the suite actually runs.
const TODAY = new Date();
const EVENT_DATE = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 18, 0, 0);

const events = [
  {
    event_id: 1,
    event_date: EVENT_DATE.toISOString(),
    title: 'Fleet Op',
    importance: 1,
    event_response: 'accepted' as const,
  },
];

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar`, () =>
    HttpResponse.json(events)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar/1`, () =>
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
  )
);

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
  useCalendarView.setState({ value: DEFAULT_CALENDAR_VIEW, hydrated: false });

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
  it('defaults to Month view and lists an event from mocked ESI', async () => {
    render(<App />);
    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Agenda view shows the response alongside the event', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet Op');
    await user.click(screen.getByRole('tab', { name: 'Agenda' }));
    // 'Fleet Op' renders in Month too, so it does not prove the switch landed;
    // the response line is Agenda's alone, and awaiting it is what waits out
    // the persisted view change.
    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(await screen.findByText(/Accepted/)).toBeInTheDocument();
  });

  it('remembers the last-picked view across a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await screen.findByText('Fleet Op');
    await user.click(screen.getByRole('tab', { name: 'Week' }));
    // Awaited, not asserted straight after the click: picking a view goes
    // through `useCalendarView.setValue`, which persists to Dexie *before* it
    // applies to the store, so the tab flips a write later than the click
    // settles. A synchronous assertion here passes only while the machine is
    // quick enough (CI run 33737544880 caught the other one of these).
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    );
    unmount();

    // Simulate a fresh page load: drop the in-memory store so the remount
    // must re-read the choice from Dexie rather than just reusing React state
    // that happens to have survived the unmount.
    useCalendarView.setState({ value: DEFAULT_CALENDAR_VIEW, hydrated: false });

    render(<App />);
    await screen.findByText(/Fleet Op/);
    // Same hydration race as above: rehydrating from Dexie lands after the
    // remounted app first paints, so this must be awaited too (CI run
    // 33845948159 caught this one).
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    );
  });

  it('Month\'s "+N more" switches to Week, anchored on that day', async () => {
    const busyDayEvents = Array.from({ length: 4 }, (_, i) => ({
      event_id: i + 1,
      event_date: new Date(
        EVENT_DATE.getFullYear(),
        EVENT_DATE.getMonth(),
        EVENT_DATE.getDate(),
        9 + i
      ).toISOString(),
      title: `Op ${i + 1}`,
      importance: 1,
      event_response: 'accepted' as const,
    }));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json(busyDayEvents)
      )
    );
    const user = userEvent.setup();
    render(<App />);
    const more = await screen.findByText('+1 more');
    await user.click(more);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    );
    expect(await screen.findByText(/Op 4/)).toBeInTheDocument();
  });

  it('shows detail in a modal on click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet Op'));
    expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Fleet Op' })).toBeInTheDocument();
  });

  it('offers .ics download and Google Calendar export in the detail modal', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet Op'));
    await screen.findByText('Bring your ship');
    expect(screen.getByRole('button', { name: 'Download .ics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Google Calendar' })).toBeInTheDocument();
  });

  it('jumps Month view to a typed date', async () => {
    render(<App />);
    await screen.findByText('Fleet Op');
    const jumpInput = screen.getByLabelText('Jump to date');
    fireEvent.change(jumpInput, { target: { value: '2030-01-15' } });
    await waitFor(() => expect(screen.getByText(/January 2030/)).toBeInTheDocument());
  });

  it('strips EVE markup from the event detail text (BUG #4)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar/1`, () =>
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
          text: 'Bring your <b>ship</b><br>Tank &amp; gank',
        })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet Op'));
    const detail = await screen.findByText(/Bring your ship/);
    expect(detail.textContent).toBe('Bring your ship\nTank & gank');
  });

  it('falls back to cached events offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'calendar',
      value: events,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no events cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the calendar scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your calendar')).toBeInTheDocument();
    expect(screen.queryByText(/no events cached/i)).not.toBeInTheDocument();
  });
});
