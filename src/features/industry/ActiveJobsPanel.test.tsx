import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { TypeMap } from '@/sde/types';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
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

/** Any character's `/skills` — the job-slot header (#679) reads this for every render, so a default with no trained slot skills keeps the rest of this file's tests unconcerned with it. */
function skillsUrl(characterId: number | string = ':characterId') {
  return `${ESI_BASE_URL}/characters/${characterId}/skills`;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  // Module-scope singleton: a value left over from a previous test would
  // make the cross-character block's assertions pass or fail for the wrong
  // reason (`Settings.test.tsx`'s precedent).
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
  server.use(http.get(skillsUrl(), () => HttpResponse.json({ skills: [], total_sp: 0 })));
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

/**
 * The job list is folded by default (verdict-first header); the table, chips,
 * and offline/refresh-failed banner only render once opened. Accepts a
 * caller's own `userEvent.setup()` instance (several tests run under fake
 * timers) or falls back to the direct API for tests that have none.
 */
async function expandJobs(user: { click: (el: Element) => Promise<void> } = userEvent) {
  await user.click(await screen.findByRole('button', { name: 'Show job list' }));
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

    const user = userEvent.setup();
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

    await expandJobs(user);
    expect(screen.getByText('Widget Beta')).toBeInTheDocument();
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();

    // Scoped to tbody: activity names also appear on the filter chips and
    // the column headers.
    const jobList = within(container.querySelector('tbody')!);
    expect(jobList.getByText('Manufacturing')).toBeInTheDocument();
    expect(jobList.getByText('Material efficiency research')).toBeInTheDocument();
    expect(jobList.getByText('Invention')).toBeInTheDocument();

    // Sort: job 3 (past, "done") first, then job 2 (30m left), then job 1 (1h30m left).
    // Scoped to tbody — the header's own "finishes in" text names job 2 (Widget
    // Beta) too, ahead of the table in DOM order, which would break the count.
    const text = container.querySelector('tbody')!.textContent ?? '';
    expect(text.indexOf('Widget Alpha')).toBeLessThan(text.indexOf('Widget Beta'));
    expect(text.indexOf('Widget Beta')).toBeLessThan(text.indexOf('Widget Gamma'));

    // Countdown, minutes granularity. Job 3 (past end_date, "done") prints
    // "Done" twice: the blueprint cell's success-tone badge, and the Ends-in
    // cell text itself — both in success tone.
    const doneTexts = screen.getAllByText('Done');
    expect(doneTexts).toHaveLength(2);
    doneTexts.forEach((el) => expect(el).toHaveClass('text-success'));
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();

    // <1h remaining ("completing soon") gets the warning-tone badge; the others don't.
    // (#409 also added an Activity/Status filter menu above the list, hence scoping.)
    expect(jobList.getByText('Completing soon')).toBeInTheDocument();

    // Job 3 (Widget Alpha, done) carries the success tint; job 2 (Widget
    // Beta, completing soon) carries the warning tint; job 1 (Widget Gamma,
    // 90m out) carries neither.
    expect(screen.getByText('Widget Alpha').closest('tr')).toHaveClass('bg-success/10');
    expect(screen.getByText('Widget Beta').closest('tr')).toHaveClass('bg-warning/10');
    const gammaRow = screen.getByText('Widget Gamma').closest('tr');
    expect(gammaRow).not.toHaveClass('bg-warning/10');
    expect(gammaRow).not.toHaveClass('bg-success/10');

    // Progress bars: past job at 100%, 30m-of-60m window at 50%, 30m-of-120m window at 25%.
    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['100', '50', '25']);

    // Absolute end date exposed via dateTime (ISO, TZ-stable) in Ends (EVE).
    // Scoped to the job list: the panel header's DataAgeBadge also renders a <time>.
    const timeEls = container.querySelectorAll('tbody time');
    expect(Array.from(timeEls).map((el) => el.getAttribute('dateTime'))).toEqual([
      new Date(NOW.getTime() - 10 * 60_000).toISOString(),
      new Date(NOW.getTime() + 30 * 60_000).toISOString(),
      new Date(NOW.getTime() + 90 * 60_000).toISOString(),
    ]);
  });

  it('folds the list by default: header states the summary, table stays hidden until opened', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);

    // Same fixture as the sorting test: 2 running (30m, 90m left), 1 done.
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([
          {
            job_id: 1,
            activity_id: 8,
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
            activity_id: 4,
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
            activity_id: 1,
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

    const caret = await screen.findByRole('button', { name: 'Show job list' });
    expect(caret).toHaveAttribute('aria-expanded', 'false');

    // Soonest unfinished job is job 2 (30m left); job 3 is done, excluded from "next".
    expect(screen.getByText('2 running · 1 done')).toBeInTheDocument();
    expect(screen.getByText('Widget Beta finishes in 30m')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says "None" beside the title, with no body at all, when ESI answers with zero jobs', async () => {
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
    // The whole point: an idle panel is its own header line, not a card that
    // stands taller than the same panel with jobs running in it.
    expect(await screen.findByText('None')).toBeInTheDocument();
    expect(screen.queryByText('No active jobs cached')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    // Still a working title line: the age badge and the refresh button stay.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
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

    await expandJobs();
    expect(screen.getByText('Widget Alpha')).toBeInTheDocument();
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

    await expandJobs(user);

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

    await expandJobs();

    // The row itself still shows the blueprint's name (unchanged); the context
    // menu it opens targets the job's product typeID.
    const row = screen.getByText('Widget Alpha').closest('tr')!;
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

    await expandJobs();
    const row = screen.getByText('Widget Alpha').closest('tr')!;
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

    await expandJobs(user);
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();

    // Scoped: the "Activity" name also belongs to the table's sortable
    // Activity column header.
    const filterGroup = screen.getByRole('group', { name: 'Filter jobs' });
    await user.click(within(filterGroup).getByRole('button', { name: 'Activity' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Manufacturing' }));
    await user.keyboard('{Escape}');

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

    await expandJobs(user);
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Completing soon' }));
    await user.keyboard('{Escape}');

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

    await expandJobs(user);

    // Every table column, header and value.
    for (const header of ['Blueprint', 'Activity', 'Runs', 'Progress', 'Ends in', 'Ends (EVE)']) {
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

describe('ActiveJobsPanel: cross-character view (issue #607)', () => {
  const CHAR_B = 92;
  const JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';

  function job(characterId: number) {
    return {
      job_id: characterId,
      activity_id: 1,
      blueprint_type_id: 100,
      facility_id: 60003760,
      station_id: 60003760,
      runs: 1,
      start_date: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      end_date: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
      status: 'active',
    };
  }

  async function seedSecondCharacter() {
    await db.characters.bulkPut([
      { characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh1', addedAt: 1 },
      { characterId: CHAR_B, name: 'Pilot Two', ownerHash: 'oh2', addedAt: 2 },
    ]);
    await db.tokens.bulkPut([
      {
        characterId: CHAR_ID,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Date.now() + 6e5,
        scopes: [JOBS_SCOPE],
      },
      {
        characterId: CHAR_B,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Date.now() + 6e5,
        scopes: [JOBS_SCOPE],
      },
    ]);
    server.use(
      http.get(jobsUrl(), () => HttpResponse.json([job(CHAR_ID)])),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/industry/jobs`, () =>
        HttpResponse.json([job(CHAR_B)])
      )
    );
  }

  beforeEach(async () => {
    await db.characters.clear();
    await db.tokens.clear();
  });

  it('renders no character filter at all for an account with one Character — "This" and "All" would name the same pilot', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh1',
      addedAt: 1,
    });
    server.use(http.get(jobsUrl(), () => HttpResponse.json([job(CHAR_ID)])));

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

    // Awaiting the fold toggle first proves the panel is fully loaded, so the
    // filter's absence is the gate rather than a not-rendered-yet race.
    expect(await screen.findByRole('button', { name: 'Show job list' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'This character' })).toBeNull();
  });

  it('puts the character filter in the panel header, so a folded panel is still one line', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();

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

    // Beside the summary in the header, not in a row of its own below it: the
    // fold hides the body, so a body-row picker leaves the "collapsed" panel
    // two rows tall with a stray control under the summary it qualifies.
    const trigger = await screen.findByRole('button', { name: 'This character' });
    expect(trigger.closest('header')).not.toBeNull();
    expect(screen.queryByRole('table', { name: 'Active jobs' })).toBeNull();
  });

  it('keeps the character filter when nothing is running — an empty panel is where the cross-character view most needs finding', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
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

    expect(await screen.findByText('None')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This character' }).closest('header')).not.toBeNull();
  });

  it('defaults to "This character" and never fetches the other character\'s jobs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

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

    expect(await screen.findByRole('button', { name: 'This character' })).toBeInTheDocument();
    await expandJobs(user);
    expect(screen.queryByText('Pilot Two')).not.toBeInTheDocument();
  });

  it('switching to "All characters" merges both characters\' jobs, tagged with their owner', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

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

    await user.click(await screen.findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All characters' }));

    await expandJobs(user);
    expect(await screen.findByText('Pilot One')).toBeInTheDocument();
    expect(screen.getByText('Pilot Two')).toBeInTheDocument();
    expect(screen.getByText('2 running · 0 done')).toBeInTheDocument();
  });

  it('only shows a "hasn\'t granted access" notice for a skipped Character actually in the selected filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
    const CHAR_C = 93;
    await db.characters.put({
      characterId: CHAR_C,
      name: 'Pilot Three',
      ownerHash: 'oh3',
      addedAt: 3,
    });
    // CHAR_C deliberately gets no token at all — never granted the scope.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

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

    await user.click(await screen.findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All characters' }));
    await expandJobs(user);

    // All three selected: Pilot Three's skipped notice shows.
    expect(
      await screen.findByText(/Pilot Three.*hasn't granted industry-jobs access/)
    ).toBeInTheDocument();

    // Narrow the filter to exclude Pilot Three — its notice must go with it,
    // even though it's still a real skipped Character overall (issue #607
    // CodeRabbit review: the notice list must follow the same filter the
    // job rows do).
    await user.click(screen.getByRole('button', { name: 'All characters' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Pilot Three' }));
    await user.keyboard('{Escape}');

    expect(
      screen.queryByText(/Pilot Three.*hasn't granted industry-jobs access/)
    ).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Active jobs' });
    expect(within(table).getByText('Pilot One')).toBeInTheDocument();
    expect(within(table).getByText('Pilot Two')).toBeInTheDocument();
  });

  it('sums open manufacturing slots across both characters once "All characters" is picked (issue #679)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
    // Pilot One: Mass Production III -> 1 + 3 = 4 max, 1 running (seeded job) -> 3 open.
    server.use(
      http.get(skillsUrl(CHAR_ID), () =>
        HttpResponse.json({
          skills: [
            {
              skill_id: 3387,
              trained_skill_level: 3,
              active_skill_level: 3,
              skillpoints_in_skill: 1,
            },
          ],
          total_sp: 1,
        })
      ),
      // Pilot Two: Mass Production I -> 1 + 1 = 2 max, 1 running (seeded job) -> 1 open.
      http.get(skillsUrl(CHAR_B), () =>
        HttpResponse.json({
          skills: [
            {
              skill_id: 3387,
              trained_skill_level: 1,
              active_skill_level: 1,
              skillpoints_in_skill: 1,
            },
          ],
          total_sp: 1,
        })
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

    // Solo: only Pilot One counts (3 open manufacturing).
    await screen.findByRole('button', { name: 'This character' });
    await waitFor(() => {
      expect(container.querySelector('.cursor-help')!.textContent).toBe('Free slots3/1/1');
    });

    await user.click(screen.getByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All characters' }));

    // Both: 4+2=6 max, 2 running -> 4 open. Science/reaction stay at the
    // untrained 1/1 for both characters (base slot only), summed to 2/2.
    await waitFor(() => {
      expect(container.querySelector('.cursor-help')!.textContent).toBe('Free slots4/2/2');
    });
  });
});

describe('ActiveJobsPanel: open job-slot header (issue #679)', () => {
  const jobId = (n: number) => 500 + n;

  function job(activityId: number, jobIdNum: number) {
    return {
      job_id: jobId(jobIdNum),
      activity_id: activityId,
      blueprint_type_id: 100,
      facility_id: 60003760,
      station_id: 60003760,
      runs: 1,
      start_date: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      end_date: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
      status: 'active',
    };
  }

  function skillsResponse(levels: Partial<Record<number, number>>) {
    return {
      skills: Object.entries(levels).map(([skillId, level]) => ({
        skill_id: Number(skillId),
        trained_skill_level: level,
        active_skill_level: level,
        skillpoints_in_skill: 1,
      })),
      total_sp: 1,
    };
  }

  it('shows per-category open counts with per-category tone, and the used/max breakdown on the tooltip', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    // Manufacturing: Mass Production III -> 1+3=4 max, 3 running -> 1 open (25% open, plain).
    // Science: no skill -> 1 max, 0 running -> 1 open (fully idle, danger).
    // Reaction: Mass Reactions I -> 1+1=2 max, 1 running -> 1 open (50% open, warning).
    server.use(
      http.get(skillsUrl(CHAR_ID), () => HttpResponse.json(skillsResponse({ 3387: 3, 45748: 1 }))),
      http.get(jobsUrl(), () => HttpResponse.json([job(1, 1), job(1, 2), job(1, 3), job(11, 4)]))
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

    await screen.findByRole('button', { name: 'Show job list' });
    const summaryEls = await screen.findAllByText('1');
    // Exactly manufacturing/science/reaction, in that order — proven by tone.
    expect(summaryEls).toHaveLength(3);
    expect(summaryEls[0]).toHaveClass('text-text');
    expect(summaryEls[1]).toHaveClass('text-danger');
    expect(summaryEls[2]).toHaveClass('text-warning');

    const summaryTrigger = container.querySelector('.cursor-help')!;
    expect(summaryTrigger.textContent).toBe('Free slots1/1/1');
    fireEvent.focus(summaryTrigger);
    // Numerator is jobs *used* (max - open), not open — 3 running of 4
    // manufacturing, 0 of 1 science, 1 of 2 reaction.
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mfg 3/4 · Sci 0/1 · Rxn 1/2');
  });

  it('renders "—" per category, never a guessed number, when skills are not cached and ESI is unreachable', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    server.use(
      http.get(skillsUrl(CHAR_ID), () => HttpResponse.error()),
      http.get(jobsUrl(), () => HttpResponse.json([]))
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

    await screen.findByText('None');
    const summaryTrigger = container.querySelector('.cursor-help')!;
    expect(summaryTrigger.textContent).toBe('Free slots—/—/—');
    fireEvent.focus(summaryTrigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mfg — · Sci — · Rxn —');
  });
});
