import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { EventDetailModal } from './EventDetailModal';
import type { CalendarEventSummary } from '@/esi/endpoints';

const CHAR_ID = 91;
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
});
afterEach(() => {
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
    expect(screen.getByText(/Importance 1/)).toBeInTheDocument();
  });

  it('shows an empty state when the event has no cached/fetchable detail', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/calendar/1`, () => HttpResponse.error())
    );
    render(<EventDetailModal characterId={CHAR_ID} event={EVENT} onClose={() => {}} />);
    expect(await screen.findByText('No event detail cached')).toBeInTheDocument();
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
