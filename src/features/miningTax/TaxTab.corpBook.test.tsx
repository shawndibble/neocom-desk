import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { DatedUnitPrices } from '@/features/miningTax/pricing';
import { buildCorpBookView, type CorpBookView } from './corpBook/corpBookView';
import type { LoadedCorpBook } from './corpBook/corpBookStore';
import type { MoonMiningTaxRow } from './snapshot';

const ME = 90000001;
const ZEO = 45490;
const CORP = 98000001;
const SYSTEM = 30003838;

const mined = (date: string, quantity: number): MoonMiningTaxRow => ({
  characterId: ME,
  characterName: 'Kestrel Vane',
  entry: {
    characterId: ME,
    date,
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEO, quantity }],
  },
  assignments: [],
  unassignedOreLines: [{ typeId: ZEO, quantity }],
});

const personalPayee = {
  id: 'p1',
  characterId: ME,
  name: 'Ashfall Prospecting',
  defaultTaxPct: 10,
  updatedAt: 1,
};

const snapshot = {
  entries: [mined('2026-10-17', 41_200), mined('2026-10-13', 5000)],
  characters: [{ characterId: ME, characterName: 'Kestrel Vane' }],
  payeesByCharacter: new Map([[ME, [personalPayee]]]),
  unclassified: [],
  reauthCharacters: [],
  fetchedAt: new Date(),
  fromCache: false,
  systemNames: new Map([[SYSTEM, 'Efa']]),
  systemSecurity: new Map([[SYSTEM, -0.1]]),
  typeNames: new Map([[ZEO, 'Zeolites']]),
  datedPrices: {
    byHubAndDate: new Map(),
    unpricedByHub: new Map(),
    sellFallbackByHubAndDate: new Map(),
    unpriced: new Set<number>(),
  } satisfies DatedUnitPrices,
  unpricedByHub: new Map(),
  unpricedTypeIds: new Set<number>(),
};

const hoisted = vi.hoisted(() => ({ view: null as CorpBookView | null }));

vi.mock('@/lib/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({
    data: snapshot,
    error: null,
    loading: false,
    activeCharacterId: 90000001,
    refresh: vi.fn(),
  }),
}));
vi.mock('./corpBook/useCorpBookView', () => ({
  useCorpBookView: () => ({ view: hoisted.view, reload: vi.fn() }),
}));
vi.mock('@/features/miningTax/madePayments', () => ({
  loadMadePaymentsWithStatus: async () => ({ payments: [], sources: [] }),
}));

const { TaxTab } = await import('./TaxTab');

const prices: DatedUnitPrices = {
  byHubAndDate: new Map([['jita', new Map([['2026-10-17', new Map([[ZEO, 148]])]])]]),
  unpricedByHub: new Map(),
  sellFallbackByHubAndDate: new Map(),
  unpriced: new Set(),
  sourcesByHubAndDate: new Map([
    ['jita', new Map([['2026-10-17', new Map([[ZEO, 'saved' as const]])]])],
  ]),
};

const book: LoadedCorpBook = {
  corporationId: CORP,
  startDate: '2026-10-01',
  graceHours: 6,
  hubId: 'jita',
  oreForm: 'compressed',
  divisions: [1],
  rates: [{ scope: 'corp', pct: 15, effectiveFrom: '2026-10-01' }],
  lastSyncedAt: '2026-10-18T12:00:00.000Z',
  observed: [
    {
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date: '2026-10-17',
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
    },
  ],
  payments: [],
  held: [],
  claimable: [],
  dismissals: [],
  statements: [],
  miners: [],
  characterIds: [ME],
  memberCharacterIds: [ME],
};

function renderTab() {
  render(
    <MemoryRouter>
      <TaxTab tabBar={null} tabsId="t" />
    </MemoryRouter>
  );
}

describe('TaxTab with a Corp Tax Book', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-18T14:00:00Z'));
    hoisted.view = null;
  });

  it('is the personal tab, unchanged, with no book (D24)', () => {
    renderTab();
    expect(screen.queryByText(/Corp Tax Book/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
  });

  it('shows the corp Payee balance, a Billed row and the Safe to pay note', async () => {
    hoisted.view = buildCorpBookView(
      {
        rows: snapshot.entries,
        loaded: [book],
        pricesByCorp: new Map([[CORP, prices]]),
        corpNames: new Map([[CORP, 'Brass Meridian Logistics']]),
        made: [],
        characterNames: new Map([[ME, 'Kestrel Vane']]),
        now: '2026-10-18T14:00:00Z',
      },
      (corp) => `${corp} (Corp Tax Book)`
    );
    const user = userEvent.setup();
    renderTab();
    expect(screen.getAllByText('Brass Meridian Logistics (Corp Tax Book)').length).toBeGreaterThan(
      0
    );
    expect(screen.getByText('Billed')).toBeInTheDocument();
    // The 13 Oct ore is free and no book observed it at all: still the member's to assign (D12).
    expect(screen.queryByText('Unattributed')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
    expect(screen.getByText(/Safe to pay — 17 Oct is closed/)).toBeInTheDocument();
    // The corp's balance has Settle up but no "Link payment": the book credits donations itself.
    expect(screen.queryByRole('button', { name: /link payment/i })).not.toBeInTheDocument();

    // The pill is a tooltip control; the row opens from its date cell.
    await user.click(screen.getAllByText('2026-10-17')[0]);
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText(/Disputed/)).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
  });
});
