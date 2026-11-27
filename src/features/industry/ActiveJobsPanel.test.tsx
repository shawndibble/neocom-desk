import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db, type BuildPlanRecord } from '@/db';
import type { BlueprintMap, TypeMap } from '@/sde/types';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ActiveJobsPanel } from './ActiveJobsPanel';
import { IndustryCharacterPicker } from './IndustryCharacterPicker';
import * as corpJobsModule from './corpJobs';
import { FakeItemActions } from '@/features/market/__fixtures__/itemActions';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const TYPES: TypeMap = {
  '100': { name: 'Widget Alpha', groupID: 1, volume: 1 },
  '200': { name: 'Widget Beta', groupID: 1, volume: 1 },
  '300': { name: 'Widget Gamma', groupID: 1, volume: 1 },
};

const BLUEPRINTS: BlueprintMap = {
  '100': {
    name: 'Widget Alpha Blueprint',
    time: 600,
    materials: [],
    products: [{ typeID: 200, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
};

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

const CHAR_ID = 91;
const NOW = new Date('2026-08-29T12:00:00Z');

const server = mswServer();

function skillsUrl(characterId: number | string = ':characterId') {
  return `${ESI_BASE_URL}/characters/${characterId}/skills`;
}

beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.industryJobHistory.clear();
  await db.productionRuns.clear();
  await db.settings.delete('characterFilterPicks');
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
  useCharacterFilterPicks.setState({ value: {}, hydrated: false });
  server.use(http.get(skillsUrl(), () => HttpResponse.json({ skills: [], total_sp: 0 })));
});
afterEach(() => {
  configureEsi({ getToken: null });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function jobsUrl() {
  return `${ESI_BASE_URL}/characters/${CHAR_ID}/industry/jobs`;
}

async function expandJobs(user: { click: (el: Element) => Promise<void> } = userEvent) {
  await user.click(await screen.findByRole('button', { name: 'Show job list' }));
}

describe('ActiveJobsPanel: rendering', () => {
  it('renders jobs sorted soonest-ending first, with blueprint + activity names, countdown, "Done", and progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);

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

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await expandJobs(user);
    expect(screen.getByText('Widget Beta')).toBeInTheDocument();
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Widget Beta' })).toBeInTheDocument();

    const jobList = within(container.querySelector('tbody')!);
    expect(jobList.getByText('Manufacturing')).toBeInTheDocument();
    expect(jobList.getByText('Material efficiency research')).toBeInTheDocument();
    expect(jobList.getByText('Invention')).toBeInTheDocument();

    const text = container.querySelector('tbody')!.textContent ?? '';
    expect(text.indexOf('Widget Alpha')).toBeLessThan(text.indexOf('Widget Beta'));
    expect(text.indexOf('Widget Beta')).toBeLessThan(text.indexOf('Widget Gamma'));

    const doneTexts = screen.getAllByText('Done');
    expect(doneTexts).toHaveLength(2);
    doneTexts.forEach((el) => expect(el).toHaveClass('text-success'));
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();

    expect(jobList.getByText('Completing soon')).toBeInTheDocument();

    expect(screen.getByText('Widget Alpha').closest('tr')).toHaveClass('bg-success/10');
    expect(screen.getByText('Widget Beta').closest('tr')).toHaveClass('bg-warning/10');
    const gammaRow = screen.getByText('Widget Gamma').closest('tr');
    expect(gammaRow).not.toHaveClass('bg-warning/10');
    expect(gammaRow).not.toHaveClass('bg-success/10');

    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['100', '50', '25']);

    bars.forEach((bar) => {
      expect(bar).toHaveClass('bg-panel-2');
      expect(bar).not.toHaveClass('bg-panel');
    });

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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    const caret = await screen.findByRole('button', { name: 'Show job list' });
    expect(caret).toHaveAttribute('aria-expanded', 'false');

    expect(screen.getByText('2 running · 1 done')).toBeInTheDocument();
    expect(screen.getByText('Widget Beta finishes in 30m')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();

    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export Jobs' })).toBeNull();
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(caret);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Jobs' })).toBeInTheDocument();
  });

  it('says "None" beside the title, with no body at all, when ESI answers with zero jobs', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([])));
    render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );
    expect(await screen.findByText('None')).toBeInTheDocument();
    expect(screen.queryByText('Job data not loaded yet')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('shows the "no data cached" empty state when there is no data at all (offline, nothing cached)', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.error()));
    render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );
    expect(await screen.findByText('Job data not loaded yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('ActiveJobsPanel: 403 (missing scope) surfaces a distinct re-login state', () => {
  beforeEach(async () => {
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh1',
      addedAt: 1,
    });
    await db.tokens.delete(CHAR_ID);
  });

  it('shows a re-login message, not the generic empty state or the offline banner', async () => {
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json({ error: 'token is not valid for scope' }, { status: 403 })
      )
    );

    render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    expect(await screen.findByText('Pilot One: grant Industry')).toBeInTheDocument();
    expect(screen.queryByText(/showing cached data/i)).toBeNull();
    expect(screen.queryByText('Job data not loaded yet')).toBeNull();
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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    const loginButton = await screen.findByRole('button', { name: 'Grant in EVE' });
    await user.click(loginButton);
    expect(beginEveLogin).toHaveBeenCalledTimes(1);
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: CHAR_ID, groups: ['industry'] });
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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await screen.findByText('Pilot One: grant Industry');
    expect(requestCount).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Pilot One: grant Industry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant in EVE' })).toBeInTheDocument();
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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await expandJobs();
    expect(screen.getByText('Widget Alpha')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant in EVE' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await expandJobs(user);

    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
    expect(screen.queryByText(/refresh failed/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Refresh failed — showing cached data')).toBeInTheDocument();
  });
});

describe('ActiveJobsPanel: filters (#409)', () => {
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

  it('has no row menu or More-actions button on a job row', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([manufacturingJob()])));

    render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await expandJobs();
    const row = screen.getByText('Widget Alpha').closest('tr')!;
    fireEvent.contextMenu(row);

    expect(screen.queryByRole('menuitem', { name: /Quickbar|Show info/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await expandJobs(user);
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();

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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
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

  it('keeps the Status filter in the URL, so a reload reopens it, and an untouched filter leaves the query empty', async () => {
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
    let search = '';
    function SearchProbe() {
      search = useLocation().search;
      return null;
    }

    render(
      <MemoryRouter initialEntries={['/industry/plans?jobs.status=completingSoon']}>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
        <SearchProbe />
      </MemoryRouter>
    );

    await expandJobs(user);
    expect(screen.getByText('Widget Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Widget Gamma')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Status/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Completing soon' }));
    await user.keyboard('{Escape}');

    expect(await screen.findByText('Widget Gamma')).toBeInTheDocument();
    expect(search).toBe('');
  });

  describe('a filter that hides every job stays clearable (#1477)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(NOW);
    });

    function renderAt(url: string) {
      const probe = { search: '' };
      function SearchProbe() {
        probe.search = useLocation().search;
        return null;
      }
      render(
        <MemoryRouter initialEntries={[url]}>
          <FakeItemActions>
            <ActiveJobsPanel characterId={CHAR_ID} />
          </FakeItemActions>
          <SearchProbe />
        </MemoryRouter>
      );
      return probe;
    }

    function filterGroup() {
      return screen.getByRole('group', { name: 'Filter jobs' });
    }

    it('keeps the Activity menu for a filtered-out activity when only one activity remains, and unchecking it restores the rows', async () => {
      server.use(
        http.get(jobsUrl(), () =>
          HttpResponse.json([
            manufacturingJob({ job_id: 1, blueprint_type_id: 100 }),
            manufacturingJob({ job_id: 2, blueprint_type_id: 300, product_type_id: undefined }),
          ])
        )
      );
      const user = userEvent.setup();
      const probe = renderAt('/industry/plans?jobs.activity=11');

      await expandJobs(user);
      expect(screen.getByText('No jobs match these filters')).toBeInTheDocument();

      await user.click(within(filterGroup()).getByRole('button', { name: 'Activity (1)' }));
      const reaction = screen.getByRole('menuitemcheckbox', { name: 'Reaction' });
      expect(reaction).toHaveAttribute('aria-checked', 'true');
      await user.click(reaction);
      await user.keyboard('{Escape}');

      expect(await screen.findByText('Widget Alpha')).toBeInTheDocument();
      expect(screen.getByText('Widget Gamma')).toBeInTheDocument();
      expect(probe.search).toBe('');
    });

    it('lists a selected-but-absent activity as a checked item beside the present ones, with the fallback label for an unknown id', async () => {
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
      renderAt('/industry/plans?jobs.activity=11,999');

      await expandJobs(user);
      await user.click(within(filterGroup()).getByRole('button', { name: 'Activity (2)' }));

      const items = screen.getAllByRole('menuitemcheckbox');
      const expected = [
        ['Manufacturing', 'false'],
        ['Invention', 'false'],
        ['Reaction', 'true'],
        ['Activity #999', 'true'],
      ];
      expect(items).toHaveLength(expected.length);
      expected.forEach(([name, checked], i) => {
        expect(items[i]).toHaveAccessibleName(name);
        expect(items[i]).toHaveAttribute('aria-checked', checked);
      });

      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Activity #999' }));
      await user.keyboard('{Escape}');
      expect(
        within(filterGroup()).getByRole('button', { name: 'Activity (1)' })
      ).toBeInTheDocument();
    });

    it('offers "Reset filters" on the filtered-to-zero state, clearing both filters and leaving the rest of the URL alone', async () => {
      server.use(
        http.get(jobsUrl(), () =>
          HttpResponse.json([
            manufacturingJob({ job_id: 1, blueprint_type_id: 100 }),
            manufacturingJob({ job_id: 2, blueprint_type_id: 300, product_type_id: undefined }),
          ])
        )
      );
      const user = userEvent.setup();
      const probe = renderAt(
        '/industry/plans?jobs.activity=11&jobs.status=done&jobs.chars=current&highlight=1&tab=keep'
      );

      expect(await screen.findByText('No jobs match these filters')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide job list' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reset filters' }));

      expect(await screen.findByText('Widget Alpha')).toBeInTheDocument();
      expect(screen.getByText('Widget Gamma')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument();
      const params = new URLSearchParams(probe.search);
      expect(params.has('jobs.activity')).toBe(false);
      expect(params.has('jobs.status')).toBe(false);
      expect(params.get('tab')).toBe('keep');
      expect(params.get('jobs.chars')).toBe('current');
      expect(screen.getByText('Widget Alpha').closest('tr')).toHaveClass('row-pulse');
    });

    it('still hides the Activity menu with no filter applied and only one activity present', async () => {
      server.use(
        http.get(jobsUrl(), () =>
          HttpResponse.json([
            manufacturingJob({ job_id: 1, blueprint_type_id: 100 }),
            manufacturingJob({ job_id: 2, blueprint_type_id: 300, product_type_id: undefined }),
          ])
        )
      );
      const user = userEvent.setup();
      renderAt('/industry/plans');

      await expandJobs(user);
      expect(screen.getByText('Widget Alpha')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Filter jobs' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument();
    });
  });
});

describe('ActiveJobsPanel: Log production from job (#1787)', () => {
  function doneJob(overrides: Record<string, unknown> = {}) {
    return {
      job_id: 1,
      activity_id: 1,
      blueprint_type_id: 100,
      product_type_id: 200,
      facility_id: 60003760,
      station_id: 60003760,
      runs: 3,
      cost: 5000,
      start_date: new Date(NOW.getTime() - 120 * 60_000).toISOString(),
      end_date: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
      status: 'active',
      ...overrides,
    };
  }

  function plan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
    return {
      id: crypto.randomUUID(),
      characterId: CHAR_ID,
      name: 'A plan',
      blueprintTypeID: 100,
      runs: 1,
      me: 0,
      te: 0,
      facility: 'npcStation',
      security: 'highsec',
      hubId: 'jita',
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  function LocationProbe({
    onLocation,
  }: {
    onLocation: (loc: ReturnType<typeof useLocation>) => void;
  }) {
    onLocation(useLocation());
    return null;
  }

  function renderPanel(onLocation: (loc: ReturnType<typeof useLocation>) => void) {
    render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
        <LocationProbe onLocation={onLocation} />
      </MemoryRouter>
    );
  }

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await db.buildPlans.clear();
  });

  const realSetActiveCharacter = useActiveCharacter.getState().setActiveCharacter;

  afterEach(() => {
    useActiveCharacter.setState({
      activeCharacterId: null,
      hydrated: false,
      setActiveCharacter: realSetActiveCharacter,
    });
    useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
    useCharacterFilterPicks.setState({ value: {}, hydrated: false });
  });

  it('shows a "Log production" button for a done manufacturing job with a product', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([doneJob()])));
    renderPanel(() => {});

    await expandJobs();

    expect(await screen.findByRole('button', { name: 'Log production' })).toBeInTheDocument();
  });

  it('omits "Log production" for a still-running job', async () => {
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([
          doneJob({ end_date: new Date(NOW.getTime() + 60 * 60_000).toISOString() }),
        ])
      )
    );
    renderPanel(() => {});

    await expandJobs();
    await screen.findByText('Widget Alpha');

    expect(screen.queryByRole('button', { name: 'Log production' })).not.toBeInTheDocument();
  });

  it('omits "Log production" for a done job with no product (research/copying/invention)', async () => {
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([doneJob({ activity_id: 8, product_type_id: undefined })])
      )
    );
    renderPanel(() => {});

    await expandJobs();
    await screen.findByText('Widget Alpha');

    expect(screen.queryByRole('button', { name: 'Log production' })).not.toBeInTheDocument();
  });

  it('navigates straight to the single matching plan, seeded with the job’s runs and cost', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([doneJob()])));
    const target = plan({ id: 'plan-1' });
    await db.buildPlans.add(target);
    let location: ReturnType<typeof useLocation> | undefined;
    renderPanel((loc) => {
      location = loc;
    });

    await expandJobs();
    fireEvent.click(await screen.findByRole('button', { name: 'Log production' }));

    await waitFor(() => expect(location?.pathname).toBe('/industry/plans/plan-1'));
    expect(location?.state).toEqual({
      logProductionFromJob: { runs: 3, jobFee: 5000, jobId: 1 },
    });
  });

  it('offers to create a Build Plan when none builds the job’s blueprint yet, then navigates to it once created', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([doneJob()])));
    let location: ReturnType<typeof useLocation> | undefined;
    renderPanel((loc) => {
      location = loc;
    });

    await expandJobs();
    fireEvent.click(await screen.findByRole('button', { name: 'Log production' }));

    expect(await screen.findByText('No Build Plan for Widget Beta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Build Plan' }));

    await waitFor(() => expect(location?.pathname).toMatch(/^\/industry\/plans\/.+/));
    expect(location?.state).toEqual({
      logProductionFromJob: { runs: 3, jobFee: 5000, jobId: 1 },
    });
    const created = await db.buildPlans.toArray();
    expect(created).toHaveLength(1);
    expect(created[0].blueprintTypeID).toBe(100);
    expect(created[0].characterId).toBe(CHAR_ID);
  });

  it('offers a picker when two or more plans build the job’s blueprint, navigating to whichever is picked', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([doneJob()])));
    await db.buildPlans.bulkAdd([
      plan({ id: 'plan-a', name: 'Plan A' }),
      plan({ id: 'plan-b', name: 'Plan B' }),
    ]);
    let location: ReturnType<typeof useLocation> | undefined;
    renderPanel((loc) => {
      location = loc;
    });

    await expandJobs();
    fireEvent.click(await screen.findByRole('button', { name: 'Log production' }));

    expect(await screen.findByText('Log production against which plan?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Plan B'));

    await waitFor(() => expect(location?.pathname).toBe('/industry/plans/plan-b'));
  });

  it('switches the active character before navigating, for a job owned by a different character in the all-characters view', async () => {
    const CHAR_B = 92;
    const JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';
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
    useDefaultCharacterFilter.setState({ value: 'all', hydrated: true });
    useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });
    server.use(
      http.get(jobsUrl(), () => HttpResponse.json([])),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/industry/jobs`, () =>
        HttpResponse.json([doneJob()])
      )
    );
    const targetPlan = plan({ id: 'plan-b-owned', characterId: CHAR_B });
    await db.buildPlans.add(targetPlan);

    let releaseSwitch!: () => void;
    const switchGate = new Promise<void>((resolve) => {
      releaseSwitch = resolve;
    });
    const gatedSetActiveCharacter = vi.fn(async (characterId: number) => {
      await switchGate;
      await realSetActiveCharacter(characterId);
    });
    useActiveCharacter.setState({ setActiveCharacter: gatedSetActiveCharacter });

    let location: ReturnType<typeof useLocation> | undefined;
    renderPanel((loc) => {
      location = loc;
    });

    await expandJobs();
    fireEvent.click(await screen.findByRole('button', { name: 'Log production' }));

    await waitFor(() => expect(gatedSetActiveCharacter).toHaveBeenCalledWith(CHAR_B));
    expect(location?.pathname).toBe('/');

    releaseSwitch();
    await waitFor(() => expect(location?.pathname).toBe('/industry/plans/plan-b-owned'));
    expect(useActiveCharacter.getState().activeCharacterId).toBe(CHAR_B);
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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await expandJobs(user);

    for (const header of ['Blueprint', 'Activity', 'Runs', 'Progress', 'Ends in', 'Ends (EVE)']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    const rows = within(container.querySelector('tbody')!).getAllByRole('row');
    expect(within(rows[0]).getByText('250')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody time')).toHaveLength(2);

    expect(within(rows[0]).getByText('Widget Alpha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Runs' }));
    await user.click(screen.getByRole('button', { name: 'Runs' }));
    const resorted = within(container.querySelector('tbody')!).getAllByRole('row');
    expect(within(resorted[0]).getByText('Widget Beta')).toBeInTheDocument();
  });

  it('offers a phone sort bar that re-sorts the jobs like the header buttons', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);

    const job = (id: number, runs: number, endMin: number) => ({
      job_id: id,
      activity_id: 1,
      blueprint_type_id: id === 1 ? 100 : 200,
      product_type_id: id === 1 ? 100 : 200,
      facility_id: 60003760,
      station_id: 60003760,
      runs,
      start_date: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
      end_date: new Date(NOW.getTime() + endMin * 60_000).toISOString(),
      status: 'active',
    });
    server.use(http.get(jobsUrl(), () => HttpResponse.json([job(1, 250, 60), job(2, 3, 180)])));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await expandJobs(user);
    const first = () => within(container.querySelector('tbody')!).getAllByRole('row')[0];
    expect(within(first()).getByText('Widget Alpha')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'runs:asc');
    expect(within(first()).getByText('Widget Beta')).toBeInTheDocument();
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
        <FakeItemActions>
          <IndustryCharacterPicker activeCharacterId={CHAR_ID} />
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Show job list' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'This character' })).toBeNull();
  });

  it('carries no character filter of its own — the Industry page header holds the one picker', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();

    render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Show job list' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'This character' })).toBeNull();
  });

  it('defaults to "This character" and never fetches the other character\'s jobs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <MemoryRouter>
        <FakeItemActions>
          <IndustryCharacterPicker activeCharacterId={CHAR_ID} />
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
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
        <FakeItemActions>
          <IndustryCharacterPicker activeCharacterId={CHAR_ID} />
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'All characters · 2' }));

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
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <MemoryRouter>
        <FakeItemActions>
          <IndustryCharacterPicker activeCharacterId={CHAR_ID} />
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'All characters · 3' }));
    await expandJobs(user);

    const skipped = (await screen.findByText(/Pilot Three —/)).closest('p')!;
    expect(
      within(skipped).getByRole('link', { name: 'Grant missing Permissions' })
    ).toHaveAttribute('href', '/settings/permissions?grant=industry');

    await user.click(screen.getByRole('button', { name: 'All characters · 3' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'This character' }));

    expect(screen.queryByText(/Pilot Three —/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Grant missing Permissions' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Pilot Two')).not.toBeInTheDocument();
  });

  it("grants a lapsed alt's own grant, not the active Character's, and names them", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/industry/jobs`, () =>
        HttpResponse.json({ error: 'token is not valid for scope' }, { status: 403 })
      )
    );
    const { beginEveLogin } = await import('@/app/loginFlow');
    vi.mocked(beginEveLogin).mockClear();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <MemoryRouter>
        <FakeItemActions>
          <IndustryCharacterPicker activeCharacterId={CHAR_ID} />
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'All characters · 2' }));

    expect(await screen.findByText('Pilot Two: log in again')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: CHAR_B, groups: ['industry'] });
  });

  it('clears the spinner when the cross-character fan-out itself fails, rather than spinning forever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
    vi.spyOn(db.tokens, 'bulkGet').mockRejectedValue(new Error('IndexedDB unavailable'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <MemoryRouter>
        <FakeItemActions>
          <IndustryCharacterPicker activeCharacterId={CHAR_ID} />
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'All characters · 2' }));

    expect(await screen.findByText('Job data not loaded yet')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });

  it('sums open manufacturing slots across both characters once "All characters" is picked (issue #679)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await seedSecondCharacter();
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
        <FakeItemActions>
          <IndustryCharacterPicker activeCharacterId={CHAR_ID} />
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'This character' });
    await waitFor(() => {
      expect(container.querySelector('.cursor-help')!.textContent).toBe('Free slots3/1/1');
    });

    await user.click(screen.getByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'All characters · 2' }));

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
    server.use(
      http.get(skillsUrl(CHAR_ID), () => HttpResponse.json(skillsResponse({ 3387: 3, 45748: 1 }))),
      http.get(jobsUrl(), () => HttpResponse.json([job(1, 1), job(1, 2), job(1, 3), job(11, 4)]))
    );

    const { container } = render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Show job list' });
    const summaryEls = await screen.findAllByText('1');
    expect(summaryEls).toHaveLength(3);
    expect(summaryEls[0]).toHaveClass('text-text');
    expect(summaryEls[1]).toHaveClass('text-danger');
    expect(summaryEls[2]).toHaveClass('text-warning');

    const summaryTrigger = container.querySelector('.cursor-help')!;
    expect(summaryTrigger.textContent).toBe('Free slots1/1/1');
    fireEvent.focus(summaryTrigger);
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
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );

    await screen.findByText('None');
    const summaryTrigger = container.querySelector('.cursor-help')!;
    expect(summaryTrigger.textContent).toBe('Free slots—/—/—');
    fireEvent.focus(summaryTrigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mfg — · Sci — · Rxn —');
  });
});

describe('ActiveJobsPanel: corp jobs by installer (issue #2302)', () => {
  const CORPMATE = 777;

  function corpJob(overrides: Record<string, unknown> = {}) {
    return {
      job_id: 500,
      installer_id: CHAR_ID,
      activity_id: 1,
      blueprint_id: 9000,
      blueprint_type_id: 300,
      blueprint_location_id: 60003760,
      output_location_id: 60003760,
      facility_id: 60003760,
      location_id: 60003760,
      runs: 2,
      start_date: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      end_date: new Date(NOW.getTime() + 90 * 60_000).toISOString(),
      status: 'active' as const,
      ...overrides,
    };
  }

  function mockCorpJobs(jobs: ReturnType<typeof corpJob>[]) {
    vi.spyOn(corpJobsModule, 'loadAccountCorpIndustryJobs').mockResolvedValue({
      jobs,
      fetchedAt: NOW,
      fromCache: false,
    });
  }

  function renderAt(url: string) {
    render(
      <MemoryRouter initialEntries={[url]}>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );
  }

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await db.characters.clear();
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh1',
      addedAt: 1,
    });
    server.use(http.get(jobsUrl(), () => HttpResponse.json([])));
  });

  it('lists a corp job the character installed, badged Corp, when it has no personal jobs', async () => {
    mockCorpJobs([corpJob(), corpJob({ job_id: 501, installer_id: CORPMATE })]);
    renderAt('/industry');

    expect(await screen.findByText('1 running · 0 done')).toBeInTheDocument();
    await expandJobs();
    const row = screen.getByText('Widget Gamma').closest('tr')!;
    expect(within(row).getByText('Corp')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it("opens itself on the job a corp alert named, even a corpmate's", async () => {
    mockCorpJobs([corpJob({ job_id: 501, installer_id: CORPMATE })]);
    renderAt('/industry?highlight=501');

    const name = await screen.findByText('Widget Gamma');
    expect(name.closest('tr')).toHaveClass('row-pulse');
    expect(screen.getByRole('button', { name: 'Hide job list' })).toBeInTheDocument();
  });

  it('stays a one-line header when no corp jobs are readable', async () => {
    mockCorpJobs([]);
    renderAt('/industry');

    expect(await screen.findByText('None')).toBeInTheDocument();
    expect(screen.queryByText(/Factory Manager/)).not.toBeInTheDocument();
  });

  it('shows no data age when the personal read failed, even with fresh corp jobs', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.error()));
    mockCorpJobs([]);
    renderAt('/industry');

    expect(await screen.findByText('Job data not loaded yet')).toBeInTheDocument();
    expect(screen.queryByText('just now')).not.toBeInTheDocument();
  });
});

describe('ActiveJobsPanel: Job History (#2866)', () => {
  function esiJob(overrides: Record<string, unknown> = {}) {
    return {
      job_id: 1,
      activity_id: 1,
      blueprint_type_id: 100,
      product_type_id: 200,
      facility_id: 60003760,
      station_id: 60003760,
      runs: 3,
      cost: 5000,
      start_date: new Date(NOW.getTime() - 240 * 60_000).toISOString(),
      end_date: new Date(NOW.getTime() - 120 * 60_000).toISOString(),
      status: 'delivered',
      ...overrides,
    };
  }

  const RUNNING = esiJob({
    job_id: 2,
    blueprint_type_id: 300,
    product_type_id: undefined,
    activity_id: 4,
    status: 'active',
    end_date: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
  });

  function renderPanel() {
    render(
      <MemoryRouter>
        <FakeItemActions>
          <ActiveJobsPanel characterId={CHAR_ID} />
        </FakeItemActions>
      </MemoryRouter>
    );
  }

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await db.buildPlans.clear();
  });

  async function openHistory() {
    fireEvent.click(await screen.findByRole('button', { name: 'History' }));
  }

  it('switches between Active and History; a delivered job never counts as running or done', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([esiJob(), RUNNING])));
    renderPanel();

    expect(await screen.findByText('1 running · 0 done')).toBeInTheDocument();
    await expandJobs();
    expect(await screen.findByText('Widget Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Widget Alpha')).not.toBeInTheDocument();

    await openHistory();

    expect(await screen.findByText('Widget Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Widget Gamma')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(await screen.findByText('Widget Gamma')).toBeInTheDocument();
  });

  it('reads a delivered invention job as "N of M succeeded", and nothing when ESI left the count out (#6166)', async () => {
    server.use(
      http.get(jobsUrl(), () =>
        HttpResponse.json([
          esiJob({
            job_id: 7,
            activity_id: 8,
            product_type_id: undefined,
            runs: 5,
            successful_runs: 0,
          }),
          esiJob({ job_id: 8, activity_id: 8, product_type_id: undefined, runs: 4 }),
          esiJob({ job_id: 9, successful_runs: 3 }),
          RUNNING,
        ])
      )
    );
    renderPanel();
    await expandJobs();
    await openHistory();

    const zero = await screen.findByText('0 of 5 succeeded');
    expect(zero).not.toHaveClass('text-danger');
    expect(screen.getAllByText(/of \d+ succeeded/)).toHaveLength(1);
  });

  it('says how many delivered jobs are unlogged while the panel is folded', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([esiJob(), RUNNING])));
    renderPanel();

    expect(await screen.findByText('1 delivered, not logged')).toBeInTheDocument();
  });

  it('dismisses a delivered job: drops it from the count, marks the row, and Undo / Restore bring it back', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([esiJob(), RUNNING])));
    renderPanel();
    expect(await screen.findByText('1 delivered, not logged')).toBeInTheDocument();
    expect(screen.queryByText(/delivered jobs?$/)).not.toBeInTheDocument();
    await openHistory();

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Dismissed')).toBeInTheDocument();
    expect(screen.queryByText('1 delivered, not logged')).not.toBeInTheDocument();
    expect((await screen.findByRole('button', { name: 'Restore' })).closest('tr')).not.toHaveClass(
      'bg-warning/10'
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(screen.getByText('1 delivered, not logged')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('tints an unlogged row and offers Log production', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([esiJob()])));
    renderPanel();
    await openHistory();

    const button = await screen.findByRole('button', { name: 'Log production' });
    expect(button.closest('tr')).toHaveClass('bg-warning/10');
    expect(screen.queryByText('Logged')).not.toBeInTheDocument();
  });

  it('marks a logged row with a badge and a link to its plan, and offers no Log production', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([esiJob()])));
    await db.buildPlans.add({
      id: 'plan-1',
      characterId: CHAR_ID,
      name: 'A plan',
      blueprintTypeID: 100,
      runs: 1,
      me: 0,
      te: 0,
    } as unknown as BuildPlanRecord);
    await db.productionRuns.add({
      id: 'run-1',
      characterId: CHAR_ID,
      buildPlanId: 'plan-1',
      productTypeID: 200,
      quantity: 3,
      materialCost: 0,
      jobFee: 5000,
      totalCost: 5000,
      loggedAt: NOW.getTime(),
      updatedAt: NOW.getTime(),
      sourceJobId: 1,
    });
    renderPanel();
    await openHistory();

    expect(await screen.findByText('Logged')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'View plan' })).toHaveAttribute(
      'href',
      '/industry/plans/plan-1'
    );
    expect(screen.queryByRole('button', { name: 'Log production' })).not.toBeInTheDocument();
    expect(screen.queryByText(/delivered, not logged/)).not.toBeInTheDocument();
  });

  it('keeps a delivered job listed after ESI stops returning it', async () => {
    server.use(http.get(jobsUrl(), () => HttpResponse.json([esiJob()])));
    renderPanel();
    await openHistory();
    expect(await screen.findByText('Widget Alpha')).toBeInTheDocument();

    expect((await db.industryJobHistory.get(CHAR_ID))?.jobs.map((j) => j.job_id)).toEqual([1]);
  });
});
