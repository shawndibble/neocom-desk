import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MoonDoc } from '../../../../functions/src/corpTaxBookMoonDocs';
import { refineryRows, type RefineryExtraction } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { RefineryPage } from './RefineryPage';

const setRefineryArchive = vi.fn();
vi.mock('../taxBook/feederClient', () => ({
  setRefineryArchive: (...args: unknown[]) => setRefineryArchive(...args),
  setRefineryLabel: vi.fn(),
}));

let listOverride: unknown;
vi.mock('./useRefineryList', () => ({
  useRefineryList: () => {
    if (listOverride) return listOverride;
    const f = feeder as { corporationId: number; refineryArchive?: Record<string, never> };
    const mine = (extractions as { sourceCorporationId?: number }[]).filter(
      (x) => x.sourceCorporationId === f.corporationId
    ) as unknown as RefineryExtraction[];
    const rows = refineryRows({
      now: NOW,
      structureIds: [
        ...new Set([
          ...mine.map((x) => x.structureId),
          ...Object.keys(f.refineryArchive ?? {}).map(Number),
        ]),
      ],
      extractions: mine,
      mining: [],
      isGone: (id) =>
        (feeder as { refineryStructures?: Record<string, { denied?: boolean }> })
          .refineryStructures?.[String(id)]?.denied === true,
      ...(f.refineryArchive ? { archive: f.refineryArchive } : {}),
    });
    return {
      active: rows.active.map((row) => ({
        structureId: row.structureId,
        ownerId: f.corporationId,
        row,
      })),
      archived: rows.archived.map((row) => ({ row, ownerId: f.corporationId })),
    };
  },
}));

const NOW = '2026-11-17T00:00:00Z';
let extractions: Record<string, unknown>[];
let feeder: Record<string, unknown>;
let docs: MoonDoc[];
let canEdit = true;
const reload = vi.fn();
vi.mock('./useBook', () => ({
  useBook: () => ({
    names: {
      corporation: () => 'Ashfall Mining Collective',
      character: (id: number) => `Miner ${id}`,
      refinery: (id: number) => `Refinery ${id}`,
      ownerRefinery: (id: number) => `Refinery ${id}`,
      moon: (id: number) => `Moon ${id}`,
      ore: () => 'Zeolites',
    },
    canEdit,
    settings: { graceHours: 24, rates: [] },
    characterId: 5,
    corporationId: 9,
    reload,
    data: { feeders: [{ joinedAt: Date.UTC(2026, 0, 1), coveragePeriods: [], ...feeder }] },
    view: {
      input: {
        now: NOW,
        rates: [],
        entries: [],
        miners: [],
        statements: [],
        extractions,
        pricesOn: () => ({ prices: new Map([[1, 10]]) }),
      },
      extractions,
      miners: [],
    },
    refinery: { structureId: 1001, docs: new Map(docs.map((d) => [d.extractionId, d])) },
  }),
}));

const pull = (id: string, over = {}) => ({
  id,
  structureId: 1001,
  moonId: 7,
  sourceCorporationId: 98,
  state: 'fractured',
  startedAt: '2026-11-10T00:00:00Z',
  chunkArrivalAt: '2026-11-12T00:00:00Z',
  plannedFractureAt: '2026-11-12T03:00:00Z',
  plannedExpiresAt: '2026-11-15T00:00:00Z',
  oreSource: 'notification',
  oreLines: [{ typeId: 1, quantity: 100 }],
  estimatedValue: 1000,
  minedPct: null,
  tax: 0,
  minerCount: 0,
  ...over,
});
const doc = (id: string, miners: MoonDoc['miners']): MoonDoc => ({
  schema: 1,
  extractionId: id,
  structureId: 1001,
  moonId: 7,
  startedAt: '2026-11-10T00:00:00Z',
  chunkArrivalAt: '2026-11-12T00:00:00Z',
  fracturedAt: '2026-11-12T03:00:00Z',
  expiresAt: '2026-11-15T03:00:00Z',
  cancelled: false,
  chunk: { source: 'notification', oreLines: [{ typeId: 1, quantity: 100 }] },
  surveyId: null,
  mined: [{ typeId: 1, quantity: 40 }],
  minedPct: 40,
  minerCount: miners.length,
  miners,
  frozenTax: 0,
  frozenLines: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  canEdit = true;
  extractions = [pull('a')];
  feeder = { corporationId: 98, status: 'active' };
  docs = [];
  listOverride = undefined;
});

const open = () =>
  render(
    <MemoryRouter>
      <RefineryPage structureId={1001} />
    </MemoryRouter>
  );
const archiveButton = () => screen.getByRole('button', { name: 'Archive' });

describe('the refinery page', () => {
  it('leads with the refinery, then its moon and owner', () => {
    open();
    expect(screen.getByRole('heading', { name: 'Refinery 1001' })).toBeTruthy();
    expect(screen.getByText('Moon 7')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ashfall Mining Collective' })).toHaveAttribute(
      'href',
      '/corp/moons/moon-owners/98'
    );
  });

  it('lists every Miner, biggest first, with no cap', () => {
    const miners = Array.from({ length: 25 }, (_, i) => ({
      minerId: `solo:${i + 1}`,
      oreLines: [{ typeId: 1, quantity: i + 1 }],
    }));
    docs = [doc('a', miners)];
    open();
    expect(screen.getByText('Miners · 25')).toBeTruthy();
    const links = screen.getAllByRole('link', { name: /^Miner \d+$/ });
    expect(links).toHaveLength(25);
    expect(links[0]).toHaveTextContent('Miner 25');
  });

  it('says nobody has mined when no doc holds a Miner', () => {
    docs = [doc('a', [])];
    open();
    expect(screen.getByText('Miners · 0')).toBeTruthy();
    expect(screen.getByText(/Nobody has mined here yet/)).toBeTruthy();
  });

  it('says so for a refinery the book does not know', () => {
    extractions = [];
    open();
    expect(screen.getByText('This refinery is not in the book.')).toBeTruthy();
  });

  it('opens a refinery known only to its moon owner, with an empty Extractions table', () => {
    extractions = [];
    feeder = { corporationId: 98, status: 'active', refineryStructures: { '1001': {} } };
    open();
    expect(screen.getByText(/No Extraction was recorded/)).toBeTruthy();
  });

  it('opens a moon owner refinery the list knows only from mining', () => {
    extractions = [];
    feeder = { corporationId: 98, status: 'active' };
    listOverride = {
      active: [{ structureId: 1001, ownerId: 98, extractionCount: 0, states: {}, tax: 0 }],
      archived: [],
    };
    open();
    expect(screen.getByText(/No Extraction was recorded/)).toBeTruthy();
    expect(screen.queryByText('This refinery is not in the book.')).toBeNull();
  });

  it('takes the archive from the list, so the page and the list cannot differ', () => {
    docs = [doc('a', [{ minerId: 'solo:1', oreLines: [{ typeId: 1, quantity: 5 }] }])];
    feeder = {
      ...feeder,
      refineryArchive: { '1001': { at: Date.UTC(2026, 10, 14), by: 5, reason: 'manual' } },
    };
    listOverride = {
      active: [],
      archived: [
        {
          ownerId: 98,
          row: {
            structureId: 1001,
            extractionCount: 1,
            mined: 0,
            offer: null,
            archive: { at: Date.UTC(2026, 10, 14), by: 5, reason: 'manual' },
          },
        },
      ],
    };
    open();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });

  it('still lets an officer archive by hand', async () => {
    setRefineryArchive.mockResolvedValue({ ok: true });
    open();
    await userEvent.click(archiveButton());
    await userEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!);
    await waitFor(() =>
      expect(setRefineryArchive).toHaveBeenCalledWith(5, 9, 98, 1001, true, 'manual')
    );
    expect(reload).toHaveBeenCalled();
  });

  it('shows the hint and records why when the structure is gone', async () => {
    setRefineryArchive.mockResolvedValue({ ok: true });
    feeder = { ...feeder, refineryStructures: { '1001': { denied: true } } };
    open();
    expect(screen.getByText(/no longer shows this structure/)).toBeInTheDocument();
    await userEvent.click(archiveButton());
    await userEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!);
    await waitFor(() =>
      expect(setRefineryArchive).toHaveBeenCalledWith(5, 9, 98, 1001, true, 'gone')
    );
  });

  it('words an idle offer with the days', () => {
    extractions = [
      pull('a', { startedAt: '2026-08-01T00:00:00Z', chunkArrivalAt: '2026-08-05T00:00:00Z' }),
    ];
    open();
    expect(screen.getByText(/No Extraction here in 104 days/)).toBeVisible();
  });

  it('swaps Archive for Restore on an archived refinery, and restores', async () => {
    setRefineryArchive.mockResolvedValue({ ok: true });
    feeder = {
      ...feeder,
      refineryArchive: { '1001': { at: Date.UTC(2026, 10, 3), by: 5, reason: 'manual' } },
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

  it('gives the book’s own refinery no Archive button', () => {
    extractions = [pull('a', { sourceCorporationId: undefined })];
    feeder = { corporationId: 55, status: 'active' };
    open();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });
});
