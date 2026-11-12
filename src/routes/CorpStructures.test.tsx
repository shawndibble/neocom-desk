import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { BoardStructureSource } from '@/engine/corp/board';
import * as boardData from '@/features/overview/data/boardData';
import { LocationProbe } from '@/test/LocationProbe';
import { CorpStructures } from './CorpStructures';

vi.mock('@/features/overview/data/boardData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/overview/data/boardData')>()),
  loadAllStructuresBoard: vi.fn(),
  loadAllMoonChunksBoard: vi.fn(),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(async () => new Map([[35832, 'Astrahus']])),
}));
vi.mock('@/features/route/useSolarSystems', () => ({
  useSolarSystemIndex: () =>
    new Map([
      [30001, { id: 30001, name: 'Efa', security: -0.2, regionId: 1 }],
      [30002, { id: 30002, name: 'Amarr', security: 1, regionId: 2 }],
    ]),
}));

const mocked = vi.mocked(boardData);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

function structure(over: Partial<BoardStructureSource> & { structureId: number }) {
  return {
    name: `Efa - Keep ${over.structureId}`,
    fuelExpiresMs: now + 20 * DAY,
    state: 'shield_vulnerable',
    stateTimerEndMs: null,
    unanchorsAtMs: null,
    services: [],
    systemId: 30001,
    typeId: 35832,
    ...over,
  } satisfies BoardStructureSource;
}

const ALPHA = structure({
  structureId: 1,
  name: 'Efa - Alpha',
  corporationId: 10,
  services: [{ name: 'Clone Bay', state: 'online' }],
});
const BETA = structure({
  structureId: 2,
  name: 'Amarr - Beta',
  systemId: 30002,
  corporationId: 20,
  fuelExpiresMs: now + 2 * HOUR,
  services: [
    { name: 'Market', state: 'offline' },
    { name: 'Clone Bay', state: 'online' },
  ],
});
const GAMMA = structure({ structureId: 3, name: 'Efa - Gamma', corporationId: 20 });

function feed(structures: BoardStructureSource[], corps: [number, string, string][]) {
  mocked.loadAllStructuresBoard.mockResolvedValue({
    structures,
    structureCount: structures.length,
    needsReauth: false,
    fetchedAt: new Date(now),
    corporations: new Map(corps.map(([id, ticker, name]) => [id, { ticker, name }])),
  });
}

function renderPage(entry = '/corp/structures') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CorpStructures />
      <LocationProbe />
    </MemoryRouter>
  );
}

async function table() {
  return waitFor(() => screen.getByRole('table', { name: 'Structures' }));
}

/** Structure names in table order. */
function names(tableEl: HTMLElement): string[] {
  return within(tableEl)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '')
    .filter(Boolean);
}

function columnHeaders(tableEl: HTMLElement): string[] {
  return within(tableEl)
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 42, hydrated: true });
  mocked.loadAllMoonChunksBoard.mockResolvedValue({
    chunks: null,
    needsReauth: false,
    fetchedAt: null,
    loadedAt: now,
  });
});

describe('CorpStructures', () => {
  it('lists two corporations’ structures together with a Corporation column', async () => {
    feed(
      [ALPHA, BETA],
      [
        [10, 'HOLD1', 'Holding One'],
        [20, 'MAIN', 'Main Corp'],
      ]
    );
    renderPage();
    const el = await table();
    expect(columnHeaders(el)[0]).toMatch(/Corporation/);
    expect(within(el).getByText('HOLD1')).toBeInTheDocument();
    expect(within(el).getByText('MAIN')).toBeInTheDocument();
  });

  it('shows no Corporation column for one corporation, and a system for every row', async () => {
    feed([ALPHA, { ...GAMMA, corporationId: 10 }], [[10, 'HOLD1', 'Holding One']]);
    renderPage();
    const el = await table();
    expect(columnHeaders(el).some((header) => /Corporation/.test(header))).toBe(false);
    // The system is its own column, not cut from the name.
    expect(within(el).getAllByText('Efa')).toHaveLength(2);
    expect(within(el).getByText('Alpha')).toBeInTheDocument();
  });

  it('opens soonest problem first, and a header click sorts', async () => {
    feed(
      [ALPHA, BETA, GAMMA],
      [
        [10, 'HOLD1', 'Holding One'],
        [20, 'MAIN', 'Main Corp'],
      ]
    );
    renderPage();
    const el = await table();
    expect(names(el).slice(0, 1)).toEqual(['MAIN']);
    expect(within(el).getAllByRole('row')[1]).toHaveTextContent('Beta');
    await userEvent.click(within(el).getByRole('button', { name: /^Structure/ }));
    expect(within(el).getAllByRole('row')[1]).toHaveTextContent('Alpha');
  });

  it('narrows by corporation, Problems only and search', async () => {
    feed(
      [ALPHA, BETA, GAMMA],
      [
        [10, 'HOLD1', 'Holding One'],
        [20, 'MAIN', 'Main Corp'],
      ]
    );
    const rows = async () => within(await table()).getAllByRole('row').length - 1;

    const first = renderPage('/corp/structures?corp=20');
    expect(await rows()).toBe(2);
    first.unmount();

    const second = renderPage('/corp/structures?problems=1');
    expect(await rows()).toBe(1);
    expect(screen.getByRole('table')).toHaveTextContent('Beta');
    second.unmount();

    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/Search structure/), 'amarr');
    await waitFor(async () => expect(await rows()).toBe(1));
    expect(screen.getByRole('table')).toHaveTextContent('Beta');
  });

  it('opens a row’s detail with every service', async () => {
    feed([BETA], [[20, 'MAIN', 'Main Corp']]);
    renderPage();
    const el = await table();
    await userEvent.click(within(el).getByText('Beta'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Market')).toBeInTheDocument();
    expect(within(dialog).getByText('Clone Bay')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('structure=2');
  });

  it('says so when no corporation’s structures can be read', async () => {
    mocked.loadAllStructuresBoard.mockResolvedValue({
      structures: null,
      structureCount: 0,
      needsReauth: false,
      fetchedAt: null,
    });
    renderPage();
    expect(await screen.findByText("No corporation's structures to show")).toBeInTheDocument();
  });
});
