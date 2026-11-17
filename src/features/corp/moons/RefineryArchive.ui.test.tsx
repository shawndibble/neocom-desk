import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import type { RefineryRow } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { ArchivedRefineries } from './ArchivedRefineries';
import { MoonOwnerPage } from './MoonOwnerPage';
import type { OwnerRefineries } from './useOwnerRefineries';

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

  it('stays collapsed when its rows load after the page', () => {
    const onRestore = vi.fn();
    const { rerender } = section([], onRestore);
    rerender(
      <MemoryRouter>
        <ArchivedRefineries
          rows={[archived]}
          name={(id) => `Refinery ${id}`}
          moonName={() => 'Moon 7'}
          pathOf={(id) => `/r/${id}`}
          byName={(id) => `Officer ${id}`}
          onRestore={onRestore}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Archived 3 Nov by Officer 5/)).toBeNull();
  });

  it('gives a viewer the rows without Restore', async () => {
    section([archived]);
    await userEvent.click(screen.getByRole('button', { name: 'Show archived refineries' }));
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });
});
