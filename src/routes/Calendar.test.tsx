import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
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

const events = [
  {
    event_id: 1,
    event_date: '2026-09-01T18:00:00Z',
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
      date: '2026-09-01T18:00:00Z',
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
  it('lists events from mocked ESI', async () => {
    render(<App />);
    expect(await screen.findByText('Fleet Op')).toBeInTheDocument();
    expect(screen.getByText(/Accepted/)).toBeInTheDocument();
  });

  it('shows detail on click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet Op'));
    expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
  });

  it('strips EVE markup from the event detail text (BUG #4)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar/1`, () =>
        HttpResponse.json({
          event_id: 1,
          title: 'Fleet Op',
          date: '2026-09-01T18:00:00Z',
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
      fetchedAt: Date.now(),
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
    expect(await screen.findByText('Log in again to see calendar events')).toBeInTheDocument();
    expect(screen.queryByText(/no events cached/i)).not.toBeInTheDocument();
  });
});
