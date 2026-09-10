import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { CachedResult, StatusResult } from '@/esi/cache';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import {
  useCorpAccess,
  type CorpAccess,
  type CorpAccessState,
} from '@/features/corp/useCorpAccess';
import type { CorporationAsset, CorporationDivisions } from '@/esi/endpoints';
import * as boardData from '@/features/corp/boardData';
import * as corpAssets from '@/features/corp/assets';
import * as corpWallet from '@/features/corp/wallet';
import { CorpAssets } from './CorpAssets';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mock('@/features/corp/boardData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/boardData')>()),
  loadCorporationId: vi.fn(),
}));
vi.mock('@/features/corp/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/assets')>()),
  loadCorporationAssets: vi.fn(),
  loadCorpAssetLabels: vi.fn(),
}));
vi.mock('@/features/corp/wallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/wallet')>()),
  loadCorporationDivisions: vi.fn(),
}));

const mockedAccess = vi.mocked(useCorpAccess);
const mocked = { ...vi.mocked(boardData), ...vi.mocked(corpAssets), ...vi.mocked(corpWallet) };

const CHARACTER_ID = 42;
const CORPORATION_ID = 98000001;
const NOW = Date.parse('2026-09-03T12:00:00Z');

function accessOf(state: CorpAccessState, capabilities: Partial<CorpCapabilities>): CorpAccess {
  return {
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, ...capabilities },
    missingScopes: [],
    roles: [],
  };
}

function cached<T>(data: T, overrides: Partial<CachedResult<T>> = {}): StatusResult<T> {
  const result: CachedResult<T> = {
    data,
    fetchedAt: new Date(NOW - 30 * 60_000),
    fromCache: false,
    truncated: false,
    ...overrides,
  };
  return { cached: result, needsReauth: false };
}

const READ_FAILED: StatusResult<never> = { cached: null, needsReauth: false };

function asset(overrides: Partial<CorporationAsset> & { item_id: number }): CorporationAsset {
  return {
    type_id: 34,
    quantity: 1,
    location_id: 60003760,
    location_type: 'other',
    location_flag: 'CorpSAG1',
    is_singleton: false,
    ...overrides,
  };
}

function renderAssets(initialEntry = '/corp/assets') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/corp/assets" element={<CorpAssets />} />
        <Route path="/corp/assets/*" element={<CorpAssets />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Renders, then waits for the division list to have replaced the loading spinner. */
async function divisionList(): Promise<HTMLElement> {
  renderAssets();
  return waitFor(() => screen.getByRole('link', { name: /Division 1/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });

  mocked.loadCorporationId.mockResolvedValue(CORPORATION_ID);
  mocked.loadCorporationAssets.mockResolvedValue(cached([asset({ item_id: 1 })]));
  mocked.loadCorporationDivisions.mockResolvedValue(cached<CorporationDivisions>({ hangar: [] }));
  mocked.loadCorpAssetLabels.mockResolvedValue({
    types: new Map([[34, 'Tritanium']]),
    locations: new Map([[60003760, 'Jita IV - Moon 4']]),
  });
  mockedAccess.mockReturnValue(accessOf('ready', { canReadAssets: true }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('access (AC2)', () => {
  it('waits rather than deciding while corp access is still resolving', () => {
    mockedAccess.mockReturnValue(accessOf('unknown', {}));
    renderAssets();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(mocked.loadCorporationAssets).not.toHaveBeenCalled();
  });

  it('renders nothing but the reason for a ready character without the assets capability', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    renderAssets();
    expect(await screen.findByText('Corp assets need Director')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(mocked.loadCorporationAssets).not.toHaveBeenCalled();
  });

  it('renders the reason for a character with no corp access at all', async () => {
    mockedAccess.mockReturnValue(accessOf('none', {}));
    renderAssets();
    expect(await screen.findByText('Corp assets need Director')).toBeInTheDocument();
  });

  it('fetches nothing when the corporation is not known yet', async () => {
    mocked.loadCorporationId.mockResolvedValue(null);
    renderAssets();
    await waitFor(() => expect(mocked.loadCorporationId).toHaveBeenCalled());
    expect(mocked.loadCorporationAssets).not.toHaveBeenCalled();
  });
});

describe('division layout (AC1)', () => {
  it('renders all seven hangar divisions, even the ones holding nothing', async () => {
    await divisionList();
    for (let division = 1; division <= 7; division += 1) {
      expect(
        screen.getByRole('link', { name: new RegExp(`Division ${division}`) })
      ).toBeInTheDocument();
    }
  });

  it('names a division from the hangar read instead of a number once one is granted', async () => {
    mocked.loadCorporationDivisions.mockResolvedValue(
      cached<CorporationDivisions>({ hangar: [{ division: 1, name: 'SRP' }] })
    );
    renderAssets();
    expect(await screen.findByRole('link', { name: /SRP/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Division 1/ })).not.toBeInTheDocument();
  });

  it('drills into a division and lists its resolved item name, quantity and location', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([asset({ item_id: 1, quantity: 5000, location_flag: 'CorpSAG3' })])
    );
    const user = userEvent.setup();
    renderAssets();
    await user.click(await screen.findByRole('link', { name: /Division 3/ }));
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('×5,000')).toBeInTheDocument();
  });

  it('keeps a division’s items out of a different division’s listing', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([
        asset({ item_id: 1, location_flag: 'CorpSAG1' }),
        asset({ item_id: 2, location_flag: 'CorpSAG7', type_id: 35 }),
      ])
    );
    mocked.loadCorpAssetLabels.mockResolvedValue({
      types: new Map([
        [34, 'Tritanium'],
        [35, 'Pyerite'],
      ]),
      locations: new Map([[60003760, 'Jita IV - Moon 4']]),
    });
    const user = userEvent.setup();
    renderAssets();
    await user.click(await screen.findByRole('link', { name: /Division 1/ }));
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back one level' }));
    await user.click(await screen.findByRole('link', { name: /Division 7/ }));
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('falls back to the raw id when an item name will not resolve', async () => {
    mocked.loadCorpAssetLabels.mockResolvedValue({ types: new Map(), locations: new Map() });
    const user = userEvent.setup();
    renderAssets();
    await user.click(await screen.findByRole('link', { name: /Division 1/ }));
    expect(await screen.findByText('Type #34')).toBeInTheDocument();
  });
});

describe('special flag groups (AC3)', () => {
  it('adds a flag group only when it holds something, with its fixed label', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([asset({ item_id: 1, location_flag: 'AssetSafety' })])
    );
    await divisionList();
    expect(screen.getByRole('link', { name: /Asset Safety/ })).toBeInTheDocument();
  });

  it('shows none of the four flag groups when nothing sits in them', async () => {
    await divisionList();
    expect(screen.queryByRole('link', { name: /Office/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Deliveries/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Impounded/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Asset Safety/ })).not.toBeInTheDocument();
  });

  /**
   * CCP can extend `location_flag` without notice; a row with a flag this
   * app has never heard of must still be visible somewhere rather than
   * silently vanishing from the one page whose job is "what does the
   * corporation own" (CONTEXT.md round 44).
   */
  it('buckets an unrecognised flag under Other rather than dropping the row', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([asset({ item_id: 1, location_flag: 'SomeFutureFlag' })])
    );
    await divisionList();
    expect(screen.getByRole('link', { name: /Other/ })).toBeInTheDocument();
  });
});

describe('truncation (AC4)', () => {
  it('shows nothing extra when the read was not truncated', async () => {
    await divisionList();
    expect(document.body.textContent).not.toContain('Incomplete data');
  });

  /**
   * Matches `/assets`' own two-part treatment: the shared `common.incompleteTitle`
   * plus a page-specific count, not the shared string alone. The two halves
   * render as sibling text nodes in one paragraph, so this checks the
   * rendered text rather than a single exact node.
   */
  it('surfaces truncation rather than dropping it silently, with the count fetched', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([asset({ item_id: 1 }), asset({ item_id: 2 })], { truncated: true })
    );
    await divisionList();
    expect(document.body.textContent).toContain('Incomplete data — some pages could not be loaded');
    expect(document.body.textContent).toContain(
      'Only the first 2 assets were fetched — this corporation has more.'
    );
  });
});

describe('manual refresh keeps the division list visible (issue #418)', () => {
  it('does not blank the division list while a refresh is in flight', async () => {
    await divisionList();

    let resolveSecondFetch!: (value: ReturnType<typeof cached<CorporationAsset[]>>) => void;
    mocked.loadCorporationAssets.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondFetch = resolve;
      })
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh corp assets' }));
    expect(screen.getByRole('link', { name: /Division 1/ })).toBeInTheDocument();

    resolveSecondFetch(cached([asset({ item_id: 1 })]));
    await waitFor(() => expect(mocked.loadCorporationAssets).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('link', { name: /Division 1/ })).toBeInTheDocument();
  });
});

describe('failed vs. genuinely empty reads', () => {
  it('shows a load-failed state rather than an empty corporation when the assets read itself failed', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(READ_FAILED);
    renderAssets();
    expect(await screen.findByText('Could not load corp assets')).toBeInTheDocument();
    expect(screen.queryByText('No corporation assets')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Division 1/ })).not.toBeInTheDocument();
  });

  /** AC5: "no access", "read failed" and "empty" must not share one generic message. */
  it('gives the load-failed state its own copy, distinct from "no access" and "empty"', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(READ_FAILED);
    renderAssets();
    const loadFailedText = await screen.findByText('Could not load corp assets');
    expect(loadFailedText).toBeInTheDocument();
    expect(screen.queryByText('Corp assets need Director')).not.toBeInTheDocument();
    expect(screen.queryByText('No corporation assets')).not.toBeInTheDocument();
  });

  it('shows the empty state when the corporation genuinely owns nothing', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(cached([]));
    renderAssets();
    expect(await screen.findByText('No corporation assets')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Division 1/ })).not.toBeInTheDocument();
  });
});

describe('row context menu (issue #420)', () => {
  it('offers View in Market and Copy name on an asset row, with no Build Plan lookup', async () => {
    const user = userEvent.setup();
    renderAssets();
    await user.click(await screen.findByRole('link', { name: /Division 1/ }));
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    // `blueprintTypeID` is `null`, not `undefined` — corp assets never loads
    // the blueprint catalog, so this must resolve instantly rather than
    // dangling in "checking…" forever.
    expect(screen.getByRole('menuitem', { name: 'No blueprint options' })).toBeInTheDocument();
  });
});

describe('search (issue #779)', () => {
  beforeEach(() => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([
        asset({ item_id: 1, type_id: 34, location_flag: 'CorpSAG1' }),
        asset({ item_id: 2, type_id: 35, location_flag: 'CorpSAG7' }),
      ])
    );
    mocked.loadCorpAssetLabels.mockResolvedValue({
      types: new Map([
        [34, 'Tritanium'],
        [35, 'Pyerite'],
      ]),
      locations: new Map([[60003760, 'Jita IV - Moon 4']]),
    });
  });

  it('finds a match across every division from the root, with no division opened by hand', async () => {
    renderAssets();
    await screen.findByRole('link', { name: /Division 1/ });
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await userEvent.setup().type(screen.getByPlaceholderText('Search items…'), 'tri');

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('clearing the search returns to the division root', async () => {
    const user = userEvent.setup();
    renderAssets();
    const search = await screen.findByPlaceholderText('Search items…');
    await user.type(search, 'tri');
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();

    await user.clear(search);

    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Division 1/ })).toBeInTheDocument();
  });
});

describe('URL drill-down (issue #779)', () => {
  it('lands directly on a division from its URL, without visiting the root first', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([asset({ item_id: 1, location_flag: 'CorpSAG3' })])
    );
    renderAssets('/corp/assets/3');
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
  });

  it('reports a stale/unknown segment instead of crashing or silently redirecting', async () => {
    renderAssets('/corp/assets/1/i:999');
    expect(await screen.findByText('This location is gone')).toBeInTheDocument();
  });
});
