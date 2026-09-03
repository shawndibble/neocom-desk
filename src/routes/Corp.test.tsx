import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { CachedResult, StatusResult } from '@/esi/cache';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import {
  useCorpAccess,
  type CorpAccess,
  type CorpAccessState,
} from '@/features/corp/useCorpAccess';
import * as boardData from '@/features/corp/boardData';
import { Corp } from './Corp';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mock('@/features/corp/boardData');
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async (ids: readonly number[]) => new Map(ids.map((id) => [id, `Type ${id}`]))
  ),
}));

const mockedAccess = vi.mocked(useCorpAccess);
const mocked = vi.mocked(boardData);

const CHARACTER_ID = 42;
const CORPORATION_ID = 98000001;
const NOW = Date.parse('2026-09-03T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();

function accessOf(state: CorpAccessState, capabilities: Partial<CorpCapabilities>): CorpAccess {
  return {
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, ...capabilities },
    missingScopes: [],
    roles: [],
  };
}

function cached<T>(data: T): StatusResult<T> {
  const result: CachedResult<T> = {
    data,
    fetchedAt: new Date(NOW - 30 * 60_000),
    fromCache: false,
    truncated: false,
  };
  return { cached: result, needsReauth: false };
}

/** Fails the test if the route ever calls a loader the capabilities did not open. */
function forbidden(name: string) {
  return vi.fn(() => {
    throw new Error(`${name} must not be called without its capability`);
  });
}

function renderCorp() {
  return render(
    <MemoryRouter initialEntries={['/corp']}>
      <Corp />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // The clock, not the timers: `waitFor` needs real ones, and every deadline
  // in this file is written relative to `NOW`.
  vi.setSystemTime(NOW);
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });

  mocked.loadCorporationId.mockResolvedValue(CORPORATION_ID);
  mocked.loadCorporationStructures.mockImplementation(forbidden('structures'));
  mocked.loadCorporationMiningExtractions.mockImplementation(forbidden('extractions'));
  mocked.loadCorporationIndustryJobs.mockImplementation(forbidden('jobs'));
  mocked.loadCorporationWallets.mockImplementation(forbidden('wallets'));
  mocked.loadCorporationDivisions.mockImplementation(forbidden('divisions'));
  mocked.loadCorporationWalletJournal.mockImplementation(forbidden('journal'));
  mockedAccess.mockReturnValue(accessOf('ready', {}));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('access states (AC1)', () => {
  /**
   * `unknown` is the one state where the route and the nav disagree, on
   * purpose: the nav renders nothing rather than flicker, but bouncing a
   * Director who deep-linked before their roles read landed would be a bug.
   */
  it('waits rather than deciding while corp access is still resolving', () => {
    mockedAccess.mockReturnValue(accessOf('unknown', {}));
    renderCorp();
    expect(screen.queryByText('No corporation access')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ops board' })).not.toBeInTheDocument();
  });

  /**
   * The cold-load order every real user hits: `useCorpAccess` reports `unknown`
   * with no capabilities for the first frames, and only then resolves.
   *
   * `useRouteSnapshot` runs its loader on mount and re-runs it only for a
   * character change or a refresh — so a loader mounted during `unknown` would
   * capture an empty capability set, fetch nothing, and never be asked again.
   * That is an empty board for every user, permanently, and it is why the board
   * is a child component mounted on `ready` rather than a branch inside one.
   */
  it('loads once access resolves, not with the empty capabilities it mounted under', async () => {
    mockedAccess.mockReturnValue(accessOf('unknown', {}));
    const { rerender } = renderCorp();
    expect(mocked.loadCorporationStructures).not.toHaveBeenCalled();

    mocked.loadCorporationStructures.mockResolvedValue(cached([]));
    mockedAccess.mockReturnValue(accessOf('ready', { canReadStructures: true }));
    rerender(
      <MemoryRouter initialEntries={['/corp']}>
        <Corp />
      </MemoryRouter>
    );

    await waitFor(() => expect(mocked.loadCorporationStructures).toHaveBeenCalled());
    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
  });

  it.each(['none', 'roles-without-grant'] as const)(
    'shows no board and no error for a %s character who reached the URL anyway',
    (state) => {
      mockedAccess.mockReturnValue(accessOf(state, {}));
      renderCorp();
      expect(screen.getByText('No corporation access')).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Corporation' })).not.toBeInTheDocument();
    }
  );
});

describe('per-panel capability gating (AC3)', () => {
  /**
   * The ticket's own example: a Station Manager who is not an Accountant sees
   * structures and no wallet rail, with no 403 surfaced and no empty state
   * standing in for a panel they were never allowed to ask about. The
   * `forbidden` loaders make "did not fetch" part of the assertion, not just
   * "did not render" — an ungated corp read buys a guaranteed 403.
   */
  it('reads structures and moons for a Station Manager, and no wallet at all', async () => {
    mockedAccess.mockReturnValue(
      accessOf('ready', { canReadStructures: true, canReadMoonExtractions: true })
    );
    mocked.loadCorporationStructures.mockResolvedValue(
      cached([
        {
          structure_id: 1,
          corporation_id: CORPORATION_ID,
          system_id: 1,
          type_id: 1,
          profile_id: 1,
          name: 'Nakugard - Home',
          fuel_expires: at(4 * DAY),
        },
      ])
    );
    mocked.loadCorporationMiningExtractions.mockResolvedValue(cached([]));

    renderCorp();

    await waitFor(() => expect(screen.getByText('Nakugard - Home')).toBeInTheDocument());
    expect(mocked.loadCorporationWallets).not.toHaveBeenCalled();
    expect(mocked.loadCorporationWalletJournal).not.toHaveBeenCalled();
    expect(mocked.loadCorporationIndustryJobs).not.toHaveBeenCalled();
    expect(screen.queryByText('Vitals')).not.toBeInTheDocument();
    // No "no jobs" noise about a panel this character cannot read.
    expect(screen.queryByText('Nothing due')).not.toBeInTheDocument();
  });

  it('shows the vitals rail, named by the corporation’s own division names', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    mocked.loadCorporationWallets.mockResolvedValue(
      cached([
        { division: 1, balance: 1_000_000 },
        { division: 3, balance: 250 },
      ])
    );
    mocked.loadCorporationDivisions.mockResolvedValue(
      cached({ wallet: [{ division: 3, name: 'SRP' }] })
    );
    mocked.loadCorporationWalletJournal.mockResolvedValue(cached([]));

    renderCorp();

    await waitFor(() => expect(screen.getByText('Vitals')).toBeInTheDocument());
    expect(screen.getByText('SRP')).toBeInTheDocument();
    // Unnamed divisions fall back to the number the client uses too.
    expect(screen.getByText('Division 1')).toBeInTheDocument();
  });

  /**
   * The runway's two halves must describe the same wallet: ESI publishes no
   * all-divisions journal, so putting every division's balance over division
   * 1's spending would answer a question nobody asked.
   *
   * 300 ISK/day out of division 1 over the 30-day window, against its 3,000 —
   * ten days, regardless of the 1,000,000 sitting untouched in division 3.
   */
  it('reports a runway from the journalled division alone', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    mocked.loadCorporationWallets.mockResolvedValue(
      cached([
        { division: 1, balance: 3_000 },
        { division: 3, balance: 1_000_000 },
      ])
    );
    mocked.loadCorporationDivisions.mockResolvedValue(cached({}));
    mocked.loadCorporationWalletJournal.mockResolvedValue(
      cached([
        {
          id: 1,
          date: at(-2 * DAY),
          ref_type: 'office_rental_fee',
          description: 'rent',
          amount: -9_000,
        },
      ])
    );

    renderCorp();

    // The plural key resolving, not the literal `corp.vitals.runwayDays_other`.
    expect(await screen.findByText('10 days')).toBeInTheDocument();
  });

  /**
   * The mirror of the case above, and the harder half of AC3: an Accountant
   * holds none of the board's three capabilities, so there is no board — not an
   * empty one saying "Nothing due" about endpoints they were never allowed to
   * ask about.
   */
  it('gives an Accountant the rail and no board panel at all', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    mocked.loadCorporationWallets.mockResolvedValue(cached([]));
    mocked.loadCorporationDivisions.mockResolvedValue(cached({}));
    mocked.loadCorporationWalletJournal.mockResolvedValue(cached([]));

    renderCorp();

    await waitFor(() => expect(screen.getByText('Vitals')).toBeInTheDocument());
    expect(screen.queryByText('Ops board')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing due')).not.toBeInTheDocument();
  });
});

describe('the board (AC2, AC5, AC6)', () => {
  beforeEach(() => {
    mockedAccess.mockReturnValue(
      accessOf('ready', {
        canReadStructures: true,
        canReadMoonExtractions: true,
        canReadIndustry: true,
      })
    );
    mocked.loadCorporationMiningExtractions.mockResolvedValue(cached([]));
    mocked.loadCorporationIndustryJobs.mockResolvedValue(cached([]));
  });

  it('names structures from the endpoint’s own field, with no resolution call (AC4)', async () => {
    mocked.loadCorporationStructures.mockResolvedValue(
      cached([
        {
          structure_id: 1,
          corporation_id: CORPORATION_ID,
          system_id: 1,
          type_id: 1,
          profile_id: 1,
          name: 'Nakugard - Home',
          fuel_expires: at(9 * DAY),
        },
      ])
    );
    renderCorp();
    await waitFor(() => expect(screen.getByText('Nakugard - Home')).toBeInTheDocument());
    expect(screen.getByText('Fuel runs out')).toBeInTheDocument();
  });

  /**
   * The failure mode the ticket names outright: an hour-stale board must not
   * present a twelve-minute timer as a live countdown.
   */
  it('refuses to print a countdown shorter than the cache window', async () => {
    mocked.loadCorporationStructures.mockResolvedValue(
      cached([
        {
          structure_id: 1,
          corporation_id: CORPORATION_ID,
          system_id: 1,
          type_id: 1,
          profile_id: 1,
          name: 'Athanor',
          fuel_expires: at(20 * DAY),
          state: 'armor_reinforce',
          state_timer_end: at(12 * 60_000),
        },
      ])
    );
    renderCorp();
    await waitFor(() => expect(screen.getByText('Under 1h')).toBeInTheDocument());
    expect(screen.queryByText('12m')).not.toBeInTheDocument();
  });

  it('leads with the most urgent item across every source', async () => {
    mocked.loadCorporationStructures.mockResolvedValue(
      cached([
        {
          structure_id: 1,
          corporation_id: CORPORATION_ID,
          system_id: 1,
          type_id: 1,
          profile_id: 1,
          name: 'Fortizar',
          fuel_expires: at(20 * DAY),
        },
      ])
    );
    mocked.loadCorporationIndustryJobs.mockResolvedValue(
      cached([
        {
          job_id: 7,
          installer_id: 1,
          activity_id: 1,
          blueprint_id: 1,
          blueprint_type_id: 1001,
          blueprint_location_id: 1,
          output_location_id: 1,
          facility_id: 1,
          location_id: 1,
          runs: 1,
          start_date: at(-10 * DAY),
          end_date: at(-3 * HOUR),
          status: 'ready',
        },
      ])
    );

    renderCorp();

    await waitFor(() => expect(screen.getByText('Fortizar')).toBeInTheDocument());
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Type 1001');
    expect(rows[1]).toHaveTextContent('Fortizar');
  });

  /** AC6: the badge is present and says plainly how stale corp data can be. */
  it('states the hourly cache in the data-age tooltip', async () => {
    mocked.loadCorporationStructures.mockResolvedValue(cached([]));
    renderCorp();
    await waitFor(() => expect(screen.getByText('Nothing due')).toBeInTheDocument());
    expect(screen.getByText('30m ago').getAttribute('title')).toContain('about an hour');
  });

  it('offers the section’s sub-nav, which Members will join', async () => {
    mocked.loadCorporationStructures.mockResolvedValue(cached([]));
    renderCorp();
    await waitFor(() => expect(screen.getByText('Nothing due')).toBeInTheDocument());
    expect(screen.getByRole('navigation', { name: 'Corporation' })).toBeInTheDocument();
  });
});

describe('an unknown corporation', () => {
  /**
   * Every corp cache key folds the corporation id in (#293). Without one there
   * is no key to read under, and reading anyway would file rows under
   * `corp:undefined:` — a row that would then survive a corporation change.
   */
  it('fetches nothing at all rather than keying a cache row on undefined', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadStructures: true }));
    mocked.loadCorporationId.mockResolvedValue(null);
    renderCorp();
    await waitFor(() => expect(screen.getByText('Nothing due')).toBeInTheDocument());
    expect(mocked.loadCorporationStructures).not.toHaveBeenCalled();
  });
});
