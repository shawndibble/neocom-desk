import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { TypeMap } from '@/sde/types';
import { ActiveJobsPanel } from './ActiveJobsPanel';

const TYPES: TypeMap = {
  '100': { name: 'Widget Alpha', groupID: 1, volume: 1 },
  '200': { name: 'Widget Beta', groupID: 1, volume: 1 },
  '300': { name: 'Widget Gamma', groupID: 1, volume: 1 },
};

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => TYPES),
}));

const CHAR_ID = 91;
const NOW = new Date('2026-08-29T12:00:00Z');

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
  vi.useRealTimers();
});
afterAll(() => server.close());

function jobsUrl() {
  return `${ESI_BASE_URL}/characters/${CHAR_ID}/industry/jobs`;
}

describe('ActiveJobsPanel: rendering', () => {
  it('renders jobs sorted soonest-ending first, with blueprint + activity names, countdown, "Done", and progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);

    // Deliberately out of end-date order in the response, to prove the
    // component sorts rather than trusting API order.
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([
          {
            job_id: 1,
            activity_id: 8, // invention
            blueprint_type_id: 300,
            facility_id: 60003760,
            station_id: 60003760,
            runs: 1,
            start_date: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
            end_date: new Date(NOW.getTime() + 90 * 60_000).toISOString(),
            status: 'active',
          },
          {
            job_id: 2,
            activity_id: 4, // material efficiency research
            blueprint_type_id: 200,
            facility_id: 60003760,
            station_id: 60003760,
            runs: 1,
            start_date: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
            end_date: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
            status: 'active',
          },
          {
            job_id: 3,
            activity_id: 1, // manufacturing
            blueprint_type_id: 100,
            facility_id: 60003760,
            station_id: 60003760,
            runs: 5,
            start_date: new Date(NOW.getTime() - 120 * 60_000).toISOString(),
            end_date: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
            status: 'ready',
          },
        ])
      )
    );

    const { container } = render(<ActiveJobsPanel characterId={CHAR_ID} />);

    await screen.findByText('Widget Alpha');
    expect(screen.getByText('Widget Beta')).toBeInTheDocument();
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();

    expect(screen.getByText('Manufacturing')).toBeInTheDocument();
    expect(screen.getByText('Material efficiency research')).toBeInTheDocument();
    expect(screen.getByText('Invention')).toBeInTheDocument();

    // Sort: job 3 (past, "done") first, then job 2 (30m left), then job 1 (1h30m left).
    const text = container.textContent ?? '';
    expect(text.indexOf('Widget Alpha')).toBeLessThan(text.indexOf('Widget Beta'));
    expect(text.indexOf('Widget Beta')).toBeLessThan(text.indexOf('Widget Gamma'));

    // Countdown, minutes granularity.
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();

    // <1h remaining ("completing soon") gets the warning-tone badge; the others don't.
    expect(screen.getByText('Completing soon')).toBeInTheDocument();

    // Progress bars: past job at 100%, 30m-of-60m window at 50%, 30m-of-120m window at 25%.
    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['100', '50', '25']);

    // Absolute end date exposed via dateTime (ISO, TZ-stable) as secondary/hover text.
    // Scoped to the job list: the panel header's DataAgeBadge also renders a <time>.
    const timeEls = container.querySelectorAll('ul time');
    expect(Array.from(timeEls).map((el) => el.getAttribute('dateTime'))).toEqual([
      new Date(NOW.getTime() - 10 * 60_000).toISOString(),
      new Date(NOW.getTime() + 30 * 60_000).toISOString(),
      new Date(NOW.getTime() + 90 * 60_000).toISOString(),
    ]);
  });

  it('shows a "no active jobs" empty state (not the reconnect one) when ESI answers with zero jobs', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([])));
    render(<ActiveJobsPanel characterId={CHAR_ID} />);
    expect(await screen.findByText('No active jobs')).toBeInTheDocument();
    expect(screen.queryByText('No active jobs cached')).toBeNull();
  });

  it('shows the "reconnect" empty state when there is no data at all (offline, nothing cached)', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.error()));
    render(<ActiveJobsPanel characterId={CHAR_ID} />);
    expect(await screen.findByText('No active jobs cached')).toBeInTheDocument();
  });
});

describe('ActiveJobsPanel: 403 (missing scope) surfaces a distinct re-login state', () => {
  it('shows a re-login message, not the generic empty state or the offline banner', async () => {
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json({ error: 'token is not valid for scope' }, { status: 403 })
      )
    );

    render(<ActiveJobsPanel characterId={CHAR_ID} />);

    expect(await screen.findByText('Log in again to see jobs')).toBeInTheDocument();
    expect(
      screen.getByText(/log this character in again to grant the new permission/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/showing cached data/i)).toBeNull();
    expect(screen.queryByText('No active jobs cached')).toBeNull();
  });
});

describe('ActiveJobsPanel: offline cache fallback', () => {
  it('falls back to cached jobs and shows the offline banner (not the reauth message)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'industryJobs',
      value: [
        {
          job_id: 1,
          activity_id: 1,
          blueprint_type_id: 100,
          facility_id: 60003760,
          station_id: 60003760,
          runs: 1,
          start_date: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
          end_date: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
          status: 'active',
        },
      ],
      fetchedAt: 1234,
    });
    server.use(http.get(jobsUrl(), () => HttpResponse.error()));

    render(<ActiveJobsPanel characterId={CHAR_ID} />);

    expect(await screen.findByText('Widget Alpha')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see jobs')).toBeNull();
  });
});
