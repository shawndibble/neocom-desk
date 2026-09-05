import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { TypeMap } from '@/sde/types';
import { ActiveJobsPanel } from './ActiveJobsPanel';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const TYPES: TypeMap = {
  '100': { name: 'Widget Alpha', groupID: 1, volume: 1 },
  '200': { name: 'Widget Beta', groupID: 1, volume: 1 },
  '300': { name: 'Widget Gamma', groupID: 1, volume: 1 },
};

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => TYPES),
  // The row context menu (issue #409) asks usePiPlannable, which reads this.
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
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

    const { container } = render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    await screen.findByText('Widget Alpha');
    expect(screen.getByText('Widget Beta')).toBeInTheDocument();
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();

    // Scoped to the table body, not the filter chips row above it (#409 added
    // a chip per activity type, so these names now also appear there) and not
    // the column headers.
    const jobList = within(container.querySelector('tbody')!);
    expect(jobList.getByText('Manufacturing')).toBeInTheDocument();
    expect(jobList.getByText('Material efficiency research')).toBeInTheDocument();
    expect(jobList.getByText('Invention')).toBeInTheDocument();

    // Sort: job 3 (past, "done") first, then job 2 (30m left), then job 1 (1h30m left).
    const text = container.textContent ?? '';
    expect(text.indexOf('Widget Alpha')).toBeLessThan(text.indexOf('Widget Beta'));
    expect(text.indexOf('Widget Beta')).toBeLessThan(text.indexOf('Widget Gamma'));

    // Countdown, minutes granularity.
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();

    // <1h remaining ("completing soon") gets the warning-tone badge; the others don't.
    // (#409 also added a "Completing soon" filter chip above the list, hence scoping.)
    expect(jobList.getByText('Completing soon')).toBeInTheDocument();

    // Progress bars: past job at 100%, 30m-of-60m window at 50%, 30m-of-120m window at 25%.
    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['100', '50', '25']);

    // Absolute end date exposed via dateTime (ISO, TZ-stable) as secondary/hover text.
    // Scoped to the job list: the panel header's DataAgeBadge also renders a <time>.
    const timeEls = container.querySelectorAll('tbody time');
    expect(Array.from(timeEls).map((el) => el.getAttribute('dateTime'))).toEqual([
      new Date(NOW.getTime() - 10 * 60_000).toISOString(),
      new Date(NOW.getTime() + 30 * 60_000).toISOString(),
      new Date(NOW.getTime() + 90 * 60_000).toISOString(),
    ]);
  });

  it('shows a "no active jobs" empty state (not the no-data-cached one) when ESI answers with zero jobs', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([])));
    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );
    expect(await screen.findByText('No active jobs')).toBeInTheDocument();
    expect(screen.queryByText('No active jobs cached')).toBeNull();
  });

  it('shows the "no data cached" empty state when there is no data at all (offline, nothing cached)', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.error()));
    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );
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

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('Log in again to see jobs')).toBeInTheDocument();
    expect(
      screen.getByText(/log this character in again to grant the new permission/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/showing cached data/i)).toBeNull();
    expect(screen.queryByText('No active jobs cached')).toBeNull();
  });

  it('offers a real login action wired to beginEveLogin (UX-REVIEW #3)', async () => {
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json({ error: 'token is not valid for scope' }, { status: 403 })
      )
    );
    const { beginEveLogin } = await import('@/app/loginFlow');
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    const loginButton = await screen.findByRole('button', { name: 'Log in again with EVE Online' });
    await user.click(loginButton);
    expect(beginEveLogin).toHaveBeenCalledTimes(1);
  });

  it('REFRESH while scope is missing re-fetches and re-shows the re-login state, not a silent no-op', async () => {
    let requestCount = 0;
    server.use(
      http.get(jobsUrl(), () => {
        requestCount += 1;
        return HttpResponse.json({ error: 'token is not valid for scope' }, { status: 403 });
      })
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    await screen.findByText('Log in again to see jobs');
    expect(requestCount).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Log in again to see jobs')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Log in again with EVE Online' })
    ).toBeInTheDocument();
    expect(requestCount).toBe(2);
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

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('Widget Alpha')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see jobs')).toBeNull();
  });

  it('distinguishes a failed manual refresh from the initial-load offline banner (UX-REVIEW #10)', async () => {
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
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    // Initial load falls back to cache too, but this is the generic banner, not "Refresh failed".
    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
    expect(screen.queryByText(/refresh failed/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Refresh failed — showing cached data')).toBeInTheDocument();
  });
});

describe('ActiveJobsPanel: row context menu and filters (#409)', () => {
  function manufacturingJob(overrides: Record<string, unknown> = {}) {
    return {
      job_id: 1,
      activity_id: 1,
      blueprint_type_id: 100,
      product_type_id: 200,
      facility_id: 60003760,
      station_id: 60003760,
      runs: 1,
      start_date: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      end_date: new Date(NOW.getTime() + 90 * 60_000).toISOString(),
      status: 'active',
      ...overrides,
    };
  }

  it('offers Add to Quickbar, View in Market, and Build Plan on a job row, keyed off its product', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([manufacturingJob()])));
    const onAddToQuickbar = vi.fn();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={onAddToQuickbar}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    // The row itself still shows the blueprint's name (unchanged); the context
    // menu it opens targets the job's product typeID.
    const row = (await screen.findByText('Widget Alpha')).closest('tr')!;
    fireEvent.contextMenu(row);

    const quickbarItem = await screen.findByText('Add to Quickbar');
    expect(screen.getByText('View in Market')).toBeInTheDocument();

    fireEvent.click(quickbarItem);
    // The job's product (200 -> Widget Beta), not its blueprint (100 -> Widget Alpha).
    expect(onAddToQuickbar).toHaveBeenCalledWith(200, 'Widget Beta');
  });

  it('disables the Build Plan action for a job with no product (research/copying/invention)', async () => {
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([manufacturingJob({ activity_id: 5, product_type_id: undefined })])
      )
    );

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    const row = (await screen.findByText('Widget Alpha')).closest('tr')!;
    fireEvent.contextMenu(row);

    expect(await screen.findByText(/no blueprint/i)).toBeInTheDocument();
  });

  it('filters jobs by activity-type chip', async () => {
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([
          manufacturingJob({ job_id: 1, activity_id: 1, blueprint_type_id: 100 }),
          manufacturingJob({
            job_id: 2,
            activity_id: 8,
            blueprint_type_id: 300,
            product_type_id: undefined,
          }),
        ])
      )
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    await screen.findByText('Widget Alpha');
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Manufacturing' }));

    expect(screen.getByText('Widget Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Widget Gamma')).not.toBeInTheDocument();
  });

  it('filters jobs to completing-soon only', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([
          manufacturingJob({
            job_id: 1,
            blueprint_type_id: 100,
            product_type_id: 200,
            end_date: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
          }),
          manufacturingJob({
            job_id: 2,
            blueprint_type_id: 300,
            product_type_id: undefined,
            end_date: new Date(NOW.getTime() + 5 * 60 * 60_000).toISOString(),
          }),
        ])
      )
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    await screen.findByText('Widget Alpha');
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Completing soon' }));

    expect(screen.getByText('Widget Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Widget Gamma')).not.toBeInTheDocument();
  });
});

describe('ActiveJobsPanel: table columns', () => {
  it('renders one sortable column set and re-sorts on a header click', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);

    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([
          {
            job_id: 1,
            activity_id: 1,
            blueprint_type_id: 100,
            product_type_id: 100,
            facility_id: 60003760,
            station_id: 60003760,
            runs: 250,
            start_date: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
            end_date: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
            status: 'active',
          },
          {
            job_id: 2,
            activity_id: 11,
            blueprint_type_id: 200,
            product_type_id: 200,
            facility_id: 60003760,
            station_id: 60003760,
            runs: 3,
            start_date: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
            end_date: new Date(NOW.getTime() + 180 * 60_000).toISOString(),
            status: 'active',
          },
        ])
      )
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <MemoryRouter>
        <ActiveJobsPanel
          characterId={CHAR_ID}
          onAddToQuickbar={() => {}}
          quickbarAvailable={true}
          onShowInfo={() => {}}
        />
      </MemoryRouter>
    );

    await screen.findByText('Widget Alpha');

    // Every column the desktop table adds over the old card, header and value.
    for (const header of ['Blueprint', 'Activity', 'Runs', 'Progress', 'Ends in', 'Ends']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    const rows = within(container.querySelector('tbody')!).getAllByRole('row');
    expect(within(rows[0]).getByText('250')).toBeInTheDocument();
    // Absolute end time as a machine-readable <time>, one per row.
    expect(container.querySelectorAll('tbody time')).toHaveLength(2);

    // Default sort is soonest-ending; sorting by runs ascending flips the pair.
    expect(within(rows[0]).getByText('Widget Alpha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Runs' }));
    const resorted = within(container.querySelector('tbody')!).getAllByRole('row');
    expect(within(resorted[0]).getByText('Widget Beta')).toBeInTheDocument();
  });
});
