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
import * as boardData from '@/features/corp/boardData';
import * as corpWallet from '@/features/corp/wallet';
import * as corpJobs from '@/features/corp/jobs';
import * as corpMembers from '@/features/corp/members';
import * as rosterState from '@/features/corp/rosterState';
import * as corpReadAccess from '@/features/corp/corpReadAccess';
import { db } from '@/db';
import {
  CORP_OVERVIEW_LAYOUT_KEY,
  useCorpOverviewLayout,
} from '@/features/overview/widgets/layoutStore';
import type { OverviewLayout } from '@/features/overview/widgets/layout';
import { CORP_DEFAULT_KINDS } from '@/features/corp/grid/corpGrid';
import { Corp } from './Corp';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
// The widget loaders gate on this before they fetch; the test sets it to the
// same capabilities `useCorpAccess` reports, as the real two always agree.
vi.mock('@/features/corp/corpReadAccess', () => ({ resolveCorpReadAccess: vi.fn() }));
vi.mock('@/features/corp/boardData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/boardData')>()),
  loadCorporationId: vi.fn(),
  loadCorporationStructures: vi.fn(),
  loadCorporationMiningExtractions: vi.fn(),
}));
// The wallet and jobs reads belong to #298's modules; the board is a consumer.
vi.mock('@/features/corp/wallet');
vi.mock('@/features/corp/jobs');
// The roster reads are #297's modules; the People rail is a second consumer.
// Spread the original so `toMemberActivity` stays the real boundary adaptation —
// the rail's figures have to be the ones `/corp/members` computes.
vi.mock('@/features/corp/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/members')>()),
  loadCorporationMemberIds: vi.fn(),
  loadCorporationMemberTracking: vi.fn(),
}));
// Replaced outright rather than spread: the real module builds a persisted
// store at module scope, and this route only ever reads from it.
vi.mock('@/features/corp/rosterState', () => ({
  readPreviousRoster: vi.fn(),
  recordRoster: vi.fn(),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async (ids: readonly number[]) => new Map(ids.map((id) => [id, `Type ${id}`]))
  ),
}));
/**
 * The People panel's name resolution (#566). Unmocked, this file made a real
 * `/universe/names` call to ESI: `Corp.tsx`'s loader awaits `resolveNames` for
 * the highlighted members, this file runs no msw server, and nothing else
 * stubs `fetch` — so every test seeding a roster hung on live network until
 * `waitFor` gave up at `asyncUtilTimeout` (5s), failing a varying handful each
 * run depending on what CCP's API did that minute.
 *
 * Resolves to an empty map, which is what the assertions here were written
 * against and what the failing call was effectively returning: the panel then
 * prints `#id` via `label(names.get(id) ?? null, id)`. Naming a member is
 * therefore still uncovered by this file — worth its own test, but not one to
 * invent here, where the fix is "stop touching the network".
 *
 * Spread from the original like the mocks above, so the module's other exports
 * stay real for anything else in the tree that imports them.
 */
vi.mock('@/features/character/names', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/names')>()),
  resolveNames: vi.fn(async () => new Map<number, string>()),
}));

const mockedAccess = vi.mocked(useCorpAccess);
/** Every loader the route calls, wherever it lives, under one name. */
const mocked = {
  ...vi.mocked(boardData),
  ...vi.mocked(corpWallet),
  ...vi.mocked(corpJobs),
  ...vi.mocked(corpMembers),
};
const mockedRoster = vi.mocked(rosterState);
const mockedReadAccess = vi.mocked(corpReadAccess);

const CHARACTER_ID = 42;
const CORPORATION_ID = 98000001;
const NOW = Date.parse('2026-09-03T12:00:00Z');
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();

function accessOf(state: CorpAccessState, capabilities: Partial<CorpCapabilities>): CorpAccess {
  const held = { ...NO_CORP_CAPABILITIES, ...capabilities };
  mockedReadAccess.resolveCorpReadAccess.mockResolvedValue(
    state === 'ready'
      ? { corporationId: CORPORATION_ID, can: (capability) => held[capability] }
      : null
  );
  return {
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, ...capabilities },
    missingScopes: [],
    roles: [],
    readFailed: false,
    retry: () => {},
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

/** A read that fell back to its saved copy, three hours old. */
function savedCopy<T>(data: T): StatusResult<T> {
  const result = cached(data).cached!;
  return {
    cached: { ...result, fromCache: true, fetchedAt: new Date(NOW - 3 * 3_600_000) },
    needsReauth: false,
  };
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

beforeEach(async () => {
  vi.clearAllMocks();
  await db.settings.clear();
  useCorpOverviewLayout.setState({ value: null, hydrated: false });
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
  mocked.loadCorporationMemberIds.mockImplementation(forbidden('memberIds'));
  mocked.loadCorporationMemberTracking.mockImplementation(forbidden('tracking'));
  mockedRoster.readPreviousRoster.mockResolvedValue(undefined);
  mockedAccess.mockReturnValue(accessOf('ready', {}));
});

afterEach(() => {
  vi.useRealTimers();
});

const STRUCTURE = {
  structure_id: 1,
  corporation_id: CORPORATION_ID,
  system_id: 1,
  type_id: 1,
  profile_id: 1,
  name: 'Nakugard - Home',
  fuel_expires: at(4 * DAY),
};

const widget = (name: string) => screen.findByRole('region', { name });

async function storedLayout(): Promise<OverviewLayout | undefined> {
  return (await db.settings.get(CORP_OVERVIEW_LAYOUT_KEY))?.value as OverviewLayout | undefined;
}

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
    expect(screen.queryByRole('heading', { name: 'Corporation' })).not.toBeInTheDocument();
  });

  /**
   * The cold-load order every real user hits: `useCorpAccess` reports `unknown`
   * with no capabilities for the first frames, and only then resolves. A grid
   * mounted during `unknown` would build its board from an empty capability
   * set, which is why it mounts on `ready`.
   */
  it('loads once access resolves, not with the empty capabilities it mounted under', async () => {
    mockedAccess.mockReturnValue(accessOf('unknown', {}));
    const { rerender } = renderCorp();
    expect(mocked.loadCorporationStructures).not.toHaveBeenCalled();

    mocked.loadCorporationStructures.mockResolvedValue(cached([STRUCTURE]));
    mockedAccess.mockReturnValue(accessOf('ready', { canReadStructures: true }));
    rerender(
      <MemoryRouter initialEntries={['/corp']}>
        <Corp />
      </MemoryRouter>
    );

    await waitFor(() => expect(mocked.loadCorporationStructures).toHaveBeenCalled());
    expect(await widget('Structures')).toBeInTheDocument();
  });

  it('shows no board and no Grant for a none character who reached the URL anyway', () => {
    mockedAccess.mockReturnValue(accessOf('none', {}));
    renderCorp();
    expect(screen.getByText('No corporation access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /grant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Corporation' })).not.toBeInTheDocument();
  });

  it.each(['not-granted', 'roles-without-grant'] as const)(
    'offers the Grant, and no board, for a %s character who reached the URL anyway',
    (state) => {
      mockedAccess.mockReturnValue(accessOf(state, {}));
      renderCorp();
      expect(screen.getByText("Corporation data isn't granted")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Grant corporation access' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Corporation' })).not.toBeInTheDocument();
    }
  );
});

describe('per-widget capability gating (AC3)', () => {
  /**
   * A Station Manager who is not an Accountant gets the clocks and no money
   * widgets, with no 403 surfaced and no empty state standing in for a widget
   * they were never allowed to ask about. The `forbidden` loaders make "did not
   * fetch" part of the assertion, not just "did not render".
   */
  it('reads structures and moons for a Station Manager, and no wallet at all', async () => {
    mockedAccess.mockReturnValue(
      accessOf('ready', { canReadStructures: true, canReadMoonExtractions: true })
    );
    mocked.loadCorporationStructures.mockResolvedValue(cached([STRUCTURE]));
    mocked.loadCorporationMiningExtractions.mockResolvedValue(cached([]));

    renderCorp();

    expect(await widget('Structures')).toBeInTheDocument();
    expect(await widget('Moon extractions')).toBeInTheDocument();
    expect(await widget('Due soon')).toBeInTheDocument();
    expect(await widget('Offline services')).toBeInTheDocument();
    await waitFor(() => expect(mocked.loadCorporationStructures).toHaveBeenCalled());
    expect(mocked.loadCorporationWallets).not.toHaveBeenCalled();
    expect(mocked.loadCorporationWalletJournal).not.toHaveBeenCalled();
    expect(mocked.loadCorporationIndustryJobs).not.toHaveBeenCalled();
    expect(mocked.loadCorporationMemberTracking).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Corp wallet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Corp industry jobs' })).not.toBeInTheDocument();
  });

  it('gives an Accountant the money widgets and no clocks', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    mocked.loadCorporationWallets.mockResolvedValue(cached([{ division: 1, balance: 5e9 }]));
    mocked.loadCorporationDivisions.mockResolvedValue(cached({ wallet: [], hangar: [] }));
    mocked.loadCorporationWalletJournal.mockResolvedValue(cached([]));

    renderCorp();

    expect(await widget('Corp wallet')).toBeInTheDocument();
    expect(await widget('Cash flow')).toBeInTheDocument();
    expect(await widget('Income by source')).toBeInTheDocument();
    expect(mocked.loadCorporationStructures).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Structures' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Due soon' })).not.toBeInTheDocument();
  });

  it('keeps a saved widget the Character cannot read, but does not draw or fetch it', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadMembers: true }));
    mocked.loadCorporationMemberTracking.mockResolvedValue(cached([]));
    mocked.loadCorporationMemberIds.mockResolvedValue(cached([]));
    await db.settings.put({
      key: CORP_OVERVIEW_LAYOUT_KEY,
      value: {
        version: 1,
        widgets: [
          {
            id: 'a',
            kind: 'corpWallet',
            size: 'M',
            view: 'table',
            scope: 'header',
            showOnPhone: true,
          },
          {
            id: 'b',
            kind: 'corpMembers',
            size: 'S',
            view: 'number',
            scope: 'header',
            showOnPhone: true,
          },
        ],
      },
    });

    renderCorp();

    expect(await widget('Members')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Corp wallet' })).not.toBeInTheDocument();
    expect(mocked.loadCorporationWallets).not.toHaveBeenCalled();
    expect((await storedLayout())?.widgets.map((w) => w.kind)).toEqual([
      'corpWallet',
      'corpMembers',
    ]);
  });
});

describe('the layout', () => {
  it('opens with a default it does not save until the pilot changes something', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadMembers: true }));
    mocked.loadCorporationMemberTracking.mockResolvedValue(cached([]));
    mocked.loadCorporationMemberIds.mockResolvedValue(cached([]));

    renderCorp();

    expect(await widget('Members')).toBeInTheDocument();
    expect(await widget('Inactive members')).toBeInTheDocument();
    expect(await storedLayout()).toBeUndefined();
  });

  it('customizes like the Overview: the Gallery offers only the corp widgets this Character can read', async () => {
    const user = userEvent.setup();
    mockedAccess.mockReturnValue(accessOf('ready', { canReadMembers: true }));
    mocked.loadCorporationMemberTracking.mockResolvedValue(cached([]));
    mocked.loadCorporationMemberIds.mockResolvedValue(cached([]));

    renderCorp();
    await widget('Members');
    await user.click(screen.getByRole('button', { name: 'Customize' }));
    expect(screen.queryByRole('button', { name: 'Start from a role' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Add widget' }));

    const gallery = await screen.findByRole('dialog', { name: 'Add a widget' });
    expect(within(gallery).getByText('Inactive members')).toBeInTheDocument();
    // Coming soon, listed for everyone.
    expect(within(gallery).getByText('Corp kills')).toBeInTheDocument();
    // Not readable with these roles, so not offered.
    expect(within(gallery).queryByText('Corp wallet')).not.toBeInTheDocument();
    // A character widget belongs to the Overview.
    expect(within(gallery).queryByText('Training')).not.toBeInTheDocument();

    await user.click(within(gallery).getByRole('button', { name: 'Add another Members' }));
    // The whole default is saved, not this Character's slice: a Director main keeps its wallet.
    await waitFor(async () =>
      expect((await storedLayout())?.widgets.map((w) => w.kind)).toEqual([
        ...CORP_DEFAULT_KINDS,
        'corpMembers',
      ])
    );
  });

  it('offers the section’s sub-nav', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadMembers: true }));
    mocked.loadCorporationMemberTracking.mockResolvedValue(cached([]));
    mocked.loadCorporationMemberIds.mockResolvedValue(cached([]));
    renderCorp();
    expect(await screen.findByRole('navigation', { name: 'Corporation' })).toBeInTheDocument();
  });
});

describe('the cached data notice', () => {
  beforeEach(() => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    mocked.loadCorporationDivisions.mockResolvedValue(cached({ wallet: [], hangar: [] }));
    mocked.loadCorporationWalletJournal.mockResolvedValue(cached([]));
  });

  it('says nothing while every read is fresh', async () => {
    mocked.loadCorporationWallets.mockResolvedValue(cached([{ division: 1, balance: 5e9 }]));
    renderCorp();
    await widget('Corp wallet');
    await waitFor(() => expect(mocked.loadCorporationWallets).toHaveBeenCalled());
    expect(screen.queryByText('Showing cached data')).not.toBeInTheDocument();
  });

  it('shows it when any one read came from the saved copy', async () => {
    mocked.loadCorporationWallets.mockResolvedValue(savedCopy([{ division: 1, balance: 5e9 }]));
    renderCorp();
    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
  });
});

describe('a failed read', () => {
  it('offers Retry for a structures read that came back empty-handed, never "your roles don’t cover this"', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadStructures: true }));
    mocked.loadCorporationStructures.mockResolvedValue({ cached: null, needsReauth: false });
    renderCorp();
    const card = await widget('Structures');
    expect(await within(card).findByText('Could not load')).toBeInTheDocument();
    expect(within(card).queryByText("Your corp roles don't cover this.")).not.toBeInTheDocument();
  });
});

describe('an unknown corporation', () => {
  it('fetches nothing at all rather than keying a cache row on undefined', async () => {
    mockedAccess.mockReturnValue(
      accessOf('ready', { canReadStructures: true, canReadWallet: true })
    );
    mockedReadAccess.resolveCorpReadAccess.mockResolvedValue(null);
    renderCorp();
    expect(await widget('Structures')).toBeInTheDocument();
    await waitFor(() => expect(mockedReadAccess.resolveCorpReadAccess).toHaveBeenCalled());
    expect(mocked.loadCorporationStructures).not.toHaveBeenCalled();
    expect(mocked.loadCorporationWallets).not.toHaveBeenCalled();
  });
});

describe('the roster baseline', () => {
  it('reads it without consuming it', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadMembers: true }));
    mocked.loadCorporationMemberTracking.mockResolvedValue(cached([]));
    mocked.loadCorporationMemberIds.mockResolvedValue(cached([1, 2]));
    mockedRoster.readPreviousRoster.mockResolvedValue([1]);
    renderCorp();
    await waitFor(() => expect(mockedRoster.readPreviousRoster).toHaveBeenCalled());
    expect(mockedRoster.recordRoster).not.toHaveBeenCalled();
  });
});
