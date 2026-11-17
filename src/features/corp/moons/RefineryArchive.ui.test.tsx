import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import type { RefineryRow } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { ArchivedRefineries } from './ArchivedRefineries';
import { MoonOwnerPage } from './MoonOwnerPage';
import type { OwnerRefineries } from './useOwnerRefineries';
import { RefineryDetail } from './RefineryDetail';

const setRefineryArchive = vi.fn();
vi.mock('../taxBook/feederClient', () => ({
  setRefineryArchive: (...args: unknown[]) => setRefineryArchive(...args),
  setRefineryLabel: vi.fn(),
}));

let refineries: OwnerRefineries;
let canEdit = true;
const reload = vi.fn();
vi.mock('./useOwnerRefineries', () => ({ useOwnerRefineries: () => refineries }));
vi.mock('./useBook', () => ({
  useBook: () => ({
    names: {
      corporation: () => 'Ashfall Mining Collective',
      character: (id: number) => `Officer ${id}`,
      ownerRefinery: (id: number) => `Refinery ${id}`,
      moon: (id: number) => `Moon ${id}`,
    },
    canEdit,
    characterId: 5,
    corporationId: 9,
    reload,
    data: { feeders: [{ corporationId: 98, status: 'active' }] },
  }),
}));

const row = (over: Partial<RefineryRow> = {}): RefineryRow => ({
  structureId: 1001,
  moonId: 7,
  extractionCount: 2,
  mined: 500,
  offer: null,
  ...over,
});

const detail: MoonOwnerDetail = {
  row: {
    id: '98',
    corporationId: 98,
    status: 'active',
    refineryCount: 1,
    mined: 0,
    owed: 0,
    balance: { kind: 'none', isk: 0 },
    mode: 'normal',
  },
  joinedAt: Date.UTC(2026, 8, 28),
  history: [],
  payouts: [],
  accrued: 0,
  paid: 0,
  mined: [{ characterId: 11, structureId: 1001, oreTypeIds: [1], quantity: 5, value: 50 }],
  hasPayee: true,
  payee: { kind: 'corporation', id: 98 },
};

beforeEach(() => {
  vi.clearAllMocks();
  canEdit = true;
  refineries = { active: [row()], archived: [], mining: [], extractions: [] };
});

describe('the miners on a moon owner page', () => {
  const page = (minerPath?: (id: number) => string) =>
    render(
      <MemoryRouter>
        <MoonOwnerPage
          detail={detail}
          name="Ashfall"
          characterName={(id) => `Miner ${id}`}
          {...(minerPath ? { minerPath } : {})}
          refineryName={() => 'Efa Tatara'}
          oreName={() => 'Zeolites'}
          backTo="/corp/moons/moon-owners"
        />
      </MemoryRouter>
    );

  it('links a miner name to their Miner page', () => {
    page((id) => `/corp/moons/miners/solo:${id}`);
    expect(screen.getByRole('link', { name: 'Miner 11' })).toHaveAttribute(
      'href',
      '/corp/moons/miners/solo:11'
    );
  });

  it('is plain text where there is no Miner page', () => {
    page();
    expect(screen.queryByRole('link', { name: 'Miner 11' })).toBeNull();
    expect(screen.getByText('Miner 11')).toBeInTheDocument();
  });
});

describe('the Archived section', () => {
  const section = (rows: RefineryRow[], onRestore?: (id: number) => Promise<void>) =>
    render(
      <MemoryRouter>
        <ArchivedRefineries
          rows={rows}
          name={(id) => `Refinery ${id}`}
          moonName={() => 'Moon 7'}
          pathOf={(id) => `/r/${id}`}
          byName={(id) => `Officer ${id}`}
          {...(onRestore ? { onRestore } : {})}
        />
      </MemoryRouter>
    );
  const archived = row({ archive: { at: Date.UTC(2026, 10, 3), by: 5, reason: 'gone' } });

  it('shows an officer an empty section with its advice', () => {
    section([], vi.fn());
    expect(screen.getByText(/Nothing archived/)).toBeInTheDocument();
  });

  it('shows a viewer nothing while it is empty', () => {
    const { container } = section([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists when, who and why, collapsed, and restores from the row', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    section([archived], onRestore);
    expect(screen.queryByText(/Archived 3 Nov by Officer 5/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show archived refineries' }));
    expect(
      screen.getByText(/Archived 3 Nov by Officer 5 · gone in the game · Moon 7/)
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Restore Refinery 1001' }));
    expect(onRestore).toHaveBeenCalledWith(1001);
  });

  it('gives a viewer the rows without Restore', async () => {
    section([archived]);
    await userEvent.click(screen.getByRole('button', { name: 'Show archived refineries' }));
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });
});

describe('the refinery page', () => {
  const open = () =>
    render(
      <MemoryRouter>
        <RefineryDetail ownerId="98" structureId={1001} />
      </MemoryRouter>
    );

  it('says nothing is offered, and still lets an officer archive by hand', async () => {
    setRefineryArchive.mockResolvedValue({ ok: true });
    open();
    expect(screen.queryByText(/Gone in the game/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!);
    await waitFor(() =>
      expect(setRefineryArchive).toHaveBeenCalledWith(5, 9, 98, 1001, true, 'manual')
    );
    expect(reload).toHaveBeenCalled();
  });

  it('shows the hint and records why when the structure is gone', async () => {
    setRefineryArchive.mockResolvedValue({ ok: true });
    refineries.active = [row({ offer: { kind: 'gone' } })];
    open();
    expect(screen.getByText(/no longer shows this structure/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!);
    await waitFor(() =>
      expect(setRefineryArchive).toHaveBeenCalledWith(5, 9, 98, 1001, true, 'gone')
    );
  });

  it('words an idle offer with the days and the last mined day', () => {
    refineries.active = [row({ offer: { kind: 'idle', days: 71 }, lastMinedOn: '2026-09-02' })];
    open();
    expect(
      screen.getByText(/No Extraction in 71 days and nothing mined since 2 Sep/)
    ).toBeVisible();
  });

  it('swaps Archive for Restore on an archived refinery, and restores', async () => {
    setRefineryArchive.mockResolvedValue({ ok: true });
    refineries = {
      ...refineries,
      active: [],
      archived: [row({ archive: { at: Date.UTC(2026, 10, 3), by: 5, reason: 'manual' } })],
    };
    open();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(setRefineryArchive).toHaveBeenCalledWith(5, 9, 98, 1001, false));
  });

  it('gives a viewer no Archive button', () => {
    canEdit = false;
    open();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });

  it('says so for a refinery that is not this moon owner’s', () => {
    refineries = { ...refineries, active: [] };
    open();
    expect(screen.getByText(/not one of this moon owner's/)).toBeInTheDocument();
  });
});
