import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { resetRevalidationState } from '@/esi/cache';
import { db } from '@/db';
import { beginEveLogin } from '@/app/loginFlow';
import { EventDetailModal } from './EventDetailModal';
import type { CalendarEventSummary } from '@/esi/endpoints';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const CHAR_ID = 91;
const DETAIL = {
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
};
const EVENT: CalendarEventSummary = {
  event_id: 1,
  event_date: '2026-09-01T18:00:00Z',
  title: 'Fleet Op',
  importance: 1,
  event_response: 'accepted',
};

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  resetRevalidationState();
  vi.mocked(beginEveLogin).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('EventDetailModal', () => {
  it('shows the event title immediately and a loading state while the detail fetches', () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () => new Promise(() => {}))
    );
    render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Fleet Op' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows importance and markup-stripped text on success', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () =>
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
          text: 'Bring your <b>ship</b>',
        })
      )
    );
    render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
    expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
    expect(screen.getByText(/High/)).toBeInTheDocument();
  });

  it('shows no importance word when the event is not important', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () =>
        HttpResponse.json({
          event_id: 1,
          title: 'Fleet Op',
          date: '2026-09-01T18:00:00Z',
          duration: 60,
          importance: 0,
          owner_id: 1,
          owner_name: 'FC',
          owner_type: 'character',
          response: 'accepted',
          text: 'Bring your <b>ship</b>',
        })
      )
    );
    render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
    expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
    expect(screen.queryByText(/High/)).not.toBeInTheDocument();
  });

  describe('load failure', () => {
    it('shows a load failure with a Try again button when nothing is cached', async () => {
      server.use(
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () => HttpResponse.error())
      );
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
      expect(await screen.findByText('Could not load')).toBeInTheDocument();
      expect(screen.getByText(/You may be offline or ESI may be busy/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('Try again re-runs the load in place and renders the detail on success', async () => {
      let fail = true;
      server.use(
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () =>
          fail ? HttpResponse.error() : HttpResponse.json(DETAIL)
        )
      );
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
      const retry = await screen.findByRole('button', { name: 'Try again' });
      fail = false;
      await userEvent.setup().click(retry);

      expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
      expect(screen.getByText(/High/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Download \.ics/i })).toBeInTheDocument();
    });

    it('a repeat failure returns to the failure state', async () => {
      let calls = 0;
      server.use(
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () => {
          calls += 1;
          return HttpResponse.error();
        })
      );
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }));

      await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(screen.getByText('Could not load')).toBeInTheDocument();
    });

    it('a load that throws ends in the failure state, not an endless spinner', async () => {
      vi.spyOn(db.esiCache, 'get').mockRejectedValue(new Error('IDB closed'));
      server.use(
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () => HttpResponse.error())
      );
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    });

    it('an auth failure with nothing cached shows the re-login banner, not Try again', async () => {
      server.use(
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () =>
          HttpResponse.json({ error: 'missing scope' }, { status: 403 })
        )
      );
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
      const login = await screen.findByRole('button', { name: 'Log in again with EVE Online' });
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      await userEvent.setup().click(login);
      expect(beginEveLogin).toHaveBeenCalledTimes(1);
    });

    it('an auth failure with stale cached detail renders that detail normally', async () => {
      await db.esiCache.put({
        characterId: CHAR_ID,
        key: 'calendar:1',
        value: DETAIL,
        fetchedAt: 3,
      });
      server.use(
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () =>
          HttpResponse.json({ error: 'missing scope' }, { status: 403 })
        )
      );
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
      expect(await screen.findByText('Bring your ship')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Log in again with EVE Online' })
      ).not.toBeInTheDocument();
    });
  });

  describe('RSVP', () => {
    function serveDetail(response: string) {
      server.use(
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () =>
          HttpResponse.json({
            event_id: 1,
            title: 'Fleet Op',
            date: '2026-09-01T18:00:00Z',
            duration: 60,
            importance: 1,
            owner_id: 1,
            owner_name: 'FC',
            owner_type: 'character',
            response,
            text: 'Bring your ship',
          })
        )
      );
    }

    it('PUTs the response and disables the buttons while saving', async () => {
      serveDetail('not_responded');
      let resolvePut!: () => void;
      server.use(
        http.put(
          `${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1/`,
          () =>
            new Promise((resolve) => {
              resolvePut = () => resolve(new HttpResponse(null, { status: 204 }));
            })
        )
      );
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);

      const acceptButton = await screen.findByRole('button', { name: 'Accept' });
      const user = userEvent.setup();
      await user.click(acceptButton);

      expect(acceptButton).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Tentative' })).toBeDisabled();

      resolvePut();
      await vi.waitFor(() => expect(acceptButton).not.toBeDisabled());
    });

    it('does not throw when the write fails, and shows a failure message', async () => {
      serveDetail('not_responded');
      server.use(
        http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1/`, () =>
          HttpResponse.json({ error: 'missing scope' }, { status: 403 })
        )
      );
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);

      const declineButton = await screen.findByRole('button', { name: 'Decline' });
      await userEvent.setup().click(declineButton);

      await vi.waitFor(() => expect(declineButton).not.toBeDisabled());
      expect(await screen.findByText(/couldn't save your response/i)).toBeInTheDocument();
    });

    it('marks the current response with aria-pressed, not color alone', async () => {
      serveDetail('tentative');
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);

      const tentativeButton = await screen.findByRole('button', { name: 'Tentative' });
      expect(tentativeButton).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Accept' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      // Once a response is picked, the button it picked already carries the
      // status — a second "Tentative" badge next to it would double the same
      // fact, so it renders only for "no answer yet" (below).
      expect(screen.queryByText('Tentative', { selector: 'p' })).not.toBeInTheDocument();
    });

    it('shows a status badge only while no response has been picked yet', async () => {
      serveDetail('not_responded');
      render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);

      expect(await screen.findByText('Not responded', { selector: 'p' })).toBeInTheDocument();
    });
  });
});
