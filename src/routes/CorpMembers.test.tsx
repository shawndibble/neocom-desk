import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import type { CorporationMemberTracking } from '@/esi/endpoints';
import * as boardData from '@/features/corp/boardData';
import * as corpMembers from '@/features/corp/members';
import * as rosterState from '@/features/corp/rosterState';
import { CorpMembers } from './CorpMembers';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mock('@/features/corp/boardData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/boardData')>()),
  loadCorporationId: vi.fn(),
}));
vi.mock('@/features/corp/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/members')>()),
  loadCorporationMemberIds: vi.fn(),
  loadCorporationMemberTracking: vi.fn(),
  loadMemberLabels: vi.fn(),
}));
vi.mock('@/features/corp/rosterState', () => ({
  readPreviousRoster: vi.fn(),
  recordRoster: vi.fn(async () => {}),
}));

const mockedAccess = vi.mocked(useCorpAccess);
const mocked = { ...vi.mocked(boardData), ...vi.mocked(corpMembers), ...vi.mocked(rosterState) };

const CHARACTER_ID = 42;
const CORPORATION_ID = 98000001;
const NOW = Date.parse('2026-09-03T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

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

function tracking(
  overrides: Partial<CorporationMemberTracking> & { character_id: number }
): CorporationMemberTracking {
  return {
    logon_date: ago(2 * HOUR),
    logoff_date: ago(HOUR),
    start_date: ago(400 * DAY),
    ship_type_id: 587,
    location_id: 60003760,
    ...overrides,
  };
}

const NAMES = new Map([
  [1001, 'Jita Local'],
  [1002, 'Silent Ren'],
  [1003, 'Fresh Recruit'],
  [1004, 'Departed Soul'],
]);

function labels(overrides: Partial<corpMembers.MemberLabels> = {}): corpMembers.MemberLabels {
  return {
    characters: NAMES,
    ships: new Map([[587, 'Rifter']]),
    locations: new Map([[60003760, 'Jita IV - Moon 4']]),
    ...overrides,
  };
}

function renderMembers() {
  return render(
    <MemoryRouter initialEntries={['/corp/members']}>
      <CorpMembers />
    </MemoryRouter>
  );
}

/** Renders, then waits for the roster table to have replaced the loading spinner. */
async function rosterTable(): Promise<HTMLElement> {
  renderMembers();
  return waitFor(() => screen.getByRole('table', { name: 'Corporation members' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });

  mocked.loadCorporationId.mockResolvedValue(CORPORATION_ID);
  mocked.loadCorporationMemberIds.mockResolvedValue(cached([1001, 1002]));
  mocked.loadCorporationMemberTracking.mockResolvedValue(
    cached([tracking({ character_id: 1001 })])
  );
  mocked.loadMemberLabels.mockResolvedValue(labels());
  mocked.readPreviousRoster.mockResolvedValue(undefined);
  mockedAccess.mockReturnValue(accessOf('ready', { canReadMembers: true }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('access (AC1)', () => {
  it('waits rather than deciding while corp access is still resolving', () => {
    mockedAccess.mockReturnValue(accessOf('unknown', {}));
    renderMembers();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(mocked.loadCorporationMemberTracking).not.toHaveBeenCalled();
  });

  /**
   * The narrower half of the gate. `membertracking` answers to Director alone,
   * so a `ready` Accountant must get the explanation rather than the table —
   * and must not spend a request buying a guaranteed 403.
   */
  it('renders nothing but the reason for a ready character without the membership capability', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    renderMembers();
    expect(await screen.findByText('Member tracking needs Director')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(mocked.loadCorporationMemberTracking).not.toHaveBeenCalled();
  });

  it('renders the reason for a character with no corp access at all', async () => {
    mockedAccess.mockReturnValue(accessOf('none', {}));
    renderMembers();
    expect(await screen.findByText('Member tracking needs Director')).toBeInTheDocument();
  });

  it('fetches nothing when the corporation is not known yet', async () => {
    mocked.loadCorporationId.mockResolvedValue(null);
    renderMembers();
    await waitFor(() => expect(mocked.loadCorporationId).toHaveBeenCalled());
    expect(mocked.loadCorporationMemberIds).not.toHaveBeenCalled();
    expect(mocked.loadCorporationMemberTracking).not.toHaveBeenCalled();
  });
});

describe('the roster table', () => {
  it('joins each member to its resolved name, ship and location', async () => {
    const table = await rosterTable();
    const row = within(table).getByText('Jita Local').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Rifter');
    expect(row).toHaveTextContent('Jita IV - Moon 4');
    expect(row).toHaveTextContent('1h ago');
  });

  it('says Never for a member who joined and has not logged in', async () => {
    mocked.loadCorporationMemberTracking.mockResolvedValue(
      cached([
        tracking({
          character_id: 1003,
          logon_date: undefined,
          logoff_date: undefined,
          ship_type_id: undefined,
          location_id: undefined,
          start_date: ago(3 * DAY),
        }),
      ])
    );
    const table = await rosterTable();
    const row = within(table).getByText('Fresh Recruit').closest('tr');
    expect(row).toHaveTextContent('Never');
  });

  /**
   * The reason the page exists: the longest silence is at the top before
   * anything is clicked. Sorted on the elapsed span the cell prints, not on the
   * date behind it — sorting on the date would lead with the people still
   * playing (AC4's default).
   */
  it('opens with the longest-silent member first', async () => {
    mocked.loadCorporationMemberTracking.mockResolvedValue(
      cached([
        tracking({ character_id: 1001, logon_date: ago(HOUR), logoff_date: ago(HOUR) }),
        tracking({ character_id: 1002, logon_date: ago(90 * DAY), logoff_date: ago(90 * DAY) }),
      ])
    );
    const table = await rosterTable();
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(names[0]).toContain('Silent Ren');
    expect(names[1]).toContain('Jita Local');
  });

  it('tones a member past the dark threshold and counts them', async () => {
    mocked.loadCorporationMemberTracking.mockResolvedValue(
      cached([
        tracking({ character_id: 1001, logon_date: ago(HOUR), logoff_date: ago(HOUR) }),
        tracking({ character_id: 1002, logon_date: ago(90 * DAY), logoff_date: ago(90 * DAY) }),
      ])
    );
    const table = await rosterTable();
    expect(within(table).getByText('90d ago').className).toContain('text-warning');
    expect(within(table).getByText('1h ago').className).not.toContain('text-warning');
    expect(screen.getByText('Dark 30d+').parentElement).toHaveTextContent('1');
  });

  it('sorts every sortable column and reports it through aria-sort (AC4)', async () => {
    const user = userEvent.setup();
    mocked.loadCorporationMemberTracking.mockResolvedValue(
      cached([
        tracking({ character_id: 1001, logon_date: ago(HOUR), logoff_date: ago(HOUR) }),
        tracking({ character_id: 1002, logon_date: ago(90 * DAY), logoff_date: ago(90 * DAY) }),
      ])
    );
    const table = await rosterTable();
    for (const name of ['Member', 'Last seen', 'Ship', 'Location', 'Joined']) {
      const header = within(table).getByRole('columnheader', { name });
      await user.click(within(header).getByRole('button'));
      expect(header).toHaveAttribute('aria-sort', 'ascending');
    }
    const member = within(table).getByRole('columnheader', { name: 'Member' });
    expect(within(member).getByRole('button')).toBeInTheDocument();
  });

  it('falls back to the id rather than a blank cell when a name will not resolve', async () => {
    mocked.loadMemberLabels.mockResolvedValue(labels({ characters: new Map(), ships: new Map() }));
    const table = await rosterTable();
    expect(within(table).getByText('#1001')).toBeInTheDocument();
  });

  it('shows an empty state rather than a bare table when tracking returns nothing', async () => {
    mocked.loadCorporationMemberTracking.mockResolvedValue(cached([]));
    renderMembers();
    expect(await screen.findByText('No member activity')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('the joins/leaves summary', () => {
  it('shows nothing at all when the roster has not changed (AC6)', async () => {
    mocked.readPreviousRoster.mockResolvedValue([1001, 1002]);
    await rosterTable();
    expect(screen.queryByText(/\d+ joined:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ left:/)).not.toBeInTheDocument();
  });

  it('shows nothing on a first visit, when there is no baseline to compare against', async () => {
    mocked.readPreviousRoster.mockResolvedValue(undefined);
    await rosterTable();
    expect(screen.queryByText(/\d+ joined:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ left:/)).not.toBeInTheDocument();
  });

  it('names who joined and who left since the last visit', async () => {
    mocked.readPreviousRoster.mockResolvedValue([1001, 1004]);
    mocked.loadCorporationMemberIds.mockResolvedValue(cached([1001, 1002]));
    await rosterTable();
    expect(screen.getByText('1 joined: Silent Ren')).toBeInTheDocument();
    expect(screen.getByText('1 left: Departed Soul')).toBeInTheDocument();
  });

  /** A leaver is in neither read any more, so their name has to be asked for. */
  it('asks for the names of members who left', async () => {
    mocked.readPreviousRoster.mockResolvedValue([1001, 1004]);
    await rosterTable();
    expect(mocked.loadMemberLabels).toHaveBeenCalledWith(CHARACTER_ID, expect.anything(), [1004]);
  });

  it('records this visit as the baseline the next one diffs against', async () => {
    await rosterTable();
    expect(mocked.recordRoster).toHaveBeenCalledWith(
      CHARACTER_ID,
      CORPORATION_ID,
      [1001, 1002],
      NOW
    );
  });

  /**
   * Overwriting the baseline with a roster we could not read would swallow
   * every change made since the last successful read.
   */
  it('leaves the baseline alone when the roster could not be read', async () => {
    mocked.loadCorporationMemberIds.mockResolvedValue({ cached: null, needsReauth: false });
    await rosterTable();
    expect(mocked.recordRoster).not.toHaveBeenCalled();
  });
});
