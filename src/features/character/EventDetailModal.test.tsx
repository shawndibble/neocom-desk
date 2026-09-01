import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(await screen.findByText('No events cached')).toBeInTheDocument();
  });
});
