// Every route renders the same figures from its own book parts as from the whole book (#5247).
// A route that joins a slice its `bookPartsFor` leaves out shows wrong figures silently, as the
// Overview did when it read `core` only: owed and Needs you ignored payments.
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import {
  buildBookView,
  nextRunPeriod,
  planStatementRun,
  statementForLine,
  type BookViewInput,
} from '@/engine/corpTaxBook/bookView';
import { extractionId } from '@/engine/corpTaxBook/sync';
import type { ObservedMiningEntry } from '@/engine/corpTaxBook/types';
import type { BookData, BookFeeder, BookSettings, OfficerVerdict } from '../taxBook/bookClient';
import { bookPartsFor, type BookDetailKind, type BookPartSet } from '../taxBook/bookParts';
import { BookProvider } from './BookContext';
import { ExtractionsTab } from './ExtractionsTab';
import { MinerDetail } from './MinerDetail';
import { MinersTab } from './MinersTab';
import { MoonDetail } from './MoonDetail';
import { MoonOwnerDetail } from './MoonOwnerDetail';
import { MoonOwnersTab } from './MoonOwnersTab';
import { OverviewTab } from './OverviewTab';
import { StatementPeriodDetail } from './StatementPeriodDetail';
import { StatementsTab } from './StatementsTab';

vi.mock('../taxBook/bookClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/bookClient')>()),
  editBook: vi.fn(),
  readAudit: vi.fn().mockResolvedValue([]),
  readVerifyTokens: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/corpTaxBook/mailQueueStore', () => ({
  listQueue: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/character/useEntityName', () => ({ useEntityName: () => 'Ore & Glory' }));

afterEach(cleanup);

const CORP = 98000001;
const MOON_OWNER = 555;
const ORE = 45490;
const SYNCED = '2026-10-20T06:00:00Z';

const mined = (
  characterId: number,
  date: string,
  quantity: number,
  over: Partial<ObservedMiningEntry> = {}
): ObservedMiningEntry => ({
  characterId,
  recordedCorporationId: CORP,
  structureId: 1001,
  moonId: 3,
  date,
  oreLines: [{ typeId: ORE, quantity }],
  ...over,
});

const ext = (start: string, arrival: string, decay: string, fired?: string) => ({
  structureId: 1001,
  moonId: 3,
  extractionStartTime: start,
  chunkArrivalTime: arrival,
  naturalDecayTime: decay,
  ...(fired ? { laserFiredAt: fired } : {}),
  oreLines: [{ typeId: ORE, quantity: 500_000 }],
});
const AUG = ext('2026-07-30T10:00:00Z', '2026-08-09T10:00:00Z', '2026-08-12T10:00:00Z');
const SEP = ext(
  '2026-09-10T10:00:00Z',
  '2026-09-20T10:00:00Z',
  '2026-09-23T10:00:00Z',
  '2026-09-20T15:00:00Z'
);
const SEP_ID = extractionId({ structureId: 1001, extractionStartTime: SEP.extractionStartTime });
const AUG_ID = extractionId({ structureId: 1001, extractionStartTime: AUG.extractionStartTime });

const ENTRIES = [
  mined(1, '2026-08-10', 4000),
  mined(1, '2026-08-11', 3000),
  mined(2, '2026-08-10', 2000),
  mined(3, '2026-08-11', 2500),
  mined(4, '2026-08-11', 1500),
  mined(1, '2026-09-20', 3500),
  mined(2, '2026-09-21', 2200),
  mined(3, '2026-09-21', 1800),
  mined(4, '2026-09-22', 1600),
  mined(1, '2026-10-05', 900, { structureId: 1002, moonId: undefined }),
  // A moon owner's miners, billable once its ledger read lands.
  mined(5, '2026-10-05', 5000, {
    recordedCorporationId: MOON_OWNER,
    sourceCorporationId: MOON_OWNER,
    structureId: 1005,
    moonId: undefined,
  }),
];

const FEEDER: BookFeeder = {
  corporationId: MOON_OWNER,
  status: 'active',
  mode: 'normal',
  invitedBy: 7,
  joinedAt: Date.parse('2026-10-01T10:00:00Z'),
  lastReadWellAt: SYNCED,
  coveragePeriods: [{ from: '2026-08-01' }],
  payouts: [],
};

const base: BookViewInput = {
  corporationId: CORP,
  now: '2026-10-20T12:00:00Z',
  startDate: '2026-08-01',
  graceHours: 6,
  minimumStatement: 0,
  overdueDays: 14,
  cadence: { kind: 'monthly' },
  hubId: 'jita',
  oreForm: 'compressed',
  structureExpiryHours: {},
  lastSyncedAt: SYNCED,
  rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
  entries: ENTRIES,
  miners: [{ id: 'g1', characterIds: [1, 2], mainCharacterId: 1 }],
  statements: [],
  payments: [],
  dismissals: [],
  declarations: [],
  adjustments: [],
  feeders: [FEEDER],
  extractions: [AUG, SEP, { ...AUG, structureId: 1003, moonId: 5 }],
  paidStatementIds: new Set(),
  pricesOn: () => ({ prices: new Map([[ORE, 1000]]), sources: new Map() }),
};

/** The ledger slice of a rich book: a payment, dismissal, declaration, adjustment, write-off, rebill. */
function richBook() {
  const first = buildBookView(base);
  const aug = planStatementRun(first, nextRunPeriod(first)!);
  const issued = aug.lines.map((l) => ({
    ...statementForLine(first, aug, l),
    issuedAt: '2026-09-01T10:00:00Z',
  }));
  // September's run bills the Extraction's days for everyone but Pilot 4, whose day is dismissed:
  // one chunk with days on a Statement and a dismissed one.
  const augOnly = buildBookView({ ...base, statements: issued });
  const sep = planStatementRun(augOnly, nextRunPeriod(augOnly)!);
  const septStatements = sep.lines
    .filter((l) => l.minerId !== 'solo:4')
    .map((l) => ({ ...statementForLine(augOnly, sep, l), issuedAt: '2026-10-02T10:00:00Z' }));
  const dismissedDay = augOnly.charges.find(
    (c) => c.minerId === 'solo:4' && c.extractionId === SEP_ID
  )!;
  const of = (minerId: string) => issued.find((s) => s.minerId === minerId)!;
  const g1 = of('g1');
  const solo3 = of('solo:3');
  const solo4 = of('solo:4');
  const ledger = {
    payments: [
      {
        id: 'p1',
        minerId: 'g1',
        characterId: 1,
        amount: Math.round(g1.amount / 2),
        at: '2026-09-05T08:00:00Z',
        source: 'donation' as const,
      },
      {
        id: 'p2',
        minerId: 'solo:3',
        characterId: 3,
        amount: solo3.amount,
        at: '2026-09-06T08:00:00Z',
        source: 'donation' as const,
      },
      {
        id: 'p3',
        characterId: 99,
        amount: 123_000,
        at: '2026-10-16T08:00:00Z',
        source: 'donation' as const,
      },
    ],
    dismissals: [
      {
        id: 'd1',
        scope: 'record' as const,
        targetId: dismissedDay.key,
        by: 7,
        at: '2026-10-01T10:00:00Z',
        reason: 'test',
      },
    ],
    declarations: [
      {
        id: 'dc1',
        statementId: solo4.id,
        kind: 'contract' as const,
        at: '2026-09-10T10:00:00Z',
      },
    ],
    adjustments: [
      {
        id: 'a1',
        minerId: 'g1',
        date: '2026-08-10',
        amount: -150,
        reason: 'rate fix',
        by: 7,
        at: '2026-09-02T10:00:00Z',
      },
    ],
    writeOffs: [
      {
        id: 'w1',
        minerId: 'solo:4',
        amount: 100,
        at: '2026-09-20T10:00:00Z',
        reason: 'goodwill',
      },
    ],
  };
  // A rebill: the August Statement re-issued after the correction, under a new id.
  const rebill = { ...solo3, id: `${solo3.id}-rebill`, issuedAt: '2026-09-03T10:00:00Z' };
  return { statements: [...issued, ...septStatements, rebill], ...ledger };
}

const RICH = richBook();

/** What `readBookData` returns for a read of `parts`: the slices left out come back empty. */
function bookData(parts: BookPartSet | undefined): BookData {
  const has = (p: 'core' | 'ledger' | 'answers') => parts === undefined || parts.has(p);
  const ledger = has('ledger');
  return {
    settings: {
      graceHours: base.graceHours,
      minimumStatement: 0,
      rates: base.rates,
    } as unknown as BookSettings,
    state: {
      miners: base.miners,
      statements: RICH.statements,
      extractions: base.extractions,
      payments: ledger ? RICH.payments : [],
      dismissals: ledger ? RICH.dismissals : [],
      writeOffs: ledger ? RICH.writeOffs : [],
      paidStatementIds: new Set<string>(),
    } as never,
    observed: [],
    declarations: ledger ? RICH.declarations : [],
    adjustments: ledger ? RICH.adjustments : [],
    feeders: [FEEDER],
    groupingAnswers: [],
  };
}

function viewOf(data: BookData) {
  return buildBookView({
    ...base,
    statements: data.state.statements,
    payments: data.state.payments,
    dismissals: data.state.dismissals,
    declarations: data.declarations,
    adjustments: data.adjustments,
    writeOffs: data.state.writeOffs ?? [],
  });
}

const verdict: OfficerVerdict = {
  corporationId: CORP,
  isCeo: false,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: true,
  bookActive: true,
  expiresAt: 0,
};

/** What a route puts on screen, from a book read as `parts`. */
function screenText(ui: ReactElement, parts: BookPartSet | undefined): string {
  const data = bookData(parts);
  const { container } = render(
    <MemoryRouter initialEntries={['/corp/moons']}>
      <BookProvider
        value={{
          characterId: 7,
          corporationId: CORP,
          view: viewOf(data),
          names: {
            character: (id) => `Pilot ${id}`,
            corporation: (id) => `Corp ${id}`,
            refinery: (id) => `Refinery ${id}`,
            ownerRefinery: (id) => `Refinery ${id}`,
            moon: (id) => `Moon ${id}`,
            ore: () => 'Sylvite',
          },
          settings: data.settings,
          data,
          verdict,
          reload: vi.fn(),
        }}
      >
        {ui}
      </BookProvider>
    </MemoryRouter>
  );
  const text = container.textContent ?? '';
  cleanup();
  return text;
}

interface Route {
  name: string;
  tab: string;
  detail: BookDetailKind | null;
  ui: ReactElement;
}
const ROUTES: Route[] = [
  { name: 'overview', tab: 'overview', detail: null, ui: <OverviewTab showMoons /> },
  { name: 'extractions', tab: 'extractions', detail: null, ui: <ExtractionsTab /> },
  { name: 'miners', tab: 'miners', detail: null, ui: <MinersTab /> },
  { name: 'statements', tab: 'statements', detail: null, ui: <StatementsTab /> },
  { name: 'moon-owners', tab: 'moon-owners', detail: null, ui: <MoonOwnersTab /> },
  { name: 'miner', tab: 'miners', detail: 'miner', ui: <MinerDetail id="g1" /> },
  {
    name: 'miner (solo, declared)',
    tab: 'miners',
    detail: 'miner',
    ui: <MinerDetail id="solo:4" />,
  },
  {
    name: 'extraction (dismissed)',
    tab: 'extractions',
    detail: 'extraction',
    ui: <MoonDetail id={SEP_ID} />,
  },
  {
    name: 'extraction (paid days)',
    tab: 'extractions',
    detail: 'extraction',
    ui: <MoonDetail id={AUG_ID} />,
  },
  {
    name: 'statement period',
    tab: 'statements',
    detail: 'statementPeriod',
    ui: <StatementPeriodDetail periodStart="2026-08-01" />,
  },
  {
    name: 'moon owner',
    tab: 'moon-owners',
    detail: 'moonOwner',
    ui: <MoonOwnerDetail id={String(MOON_OWNER)} />,
  },
];

describe('book parts parity', () => {
  it('the rich book has a payment, dismissal, declaration, adjustment, write-off and rebill', () => {
    expect(RICH.payments.length).toBeGreaterThan(1);
    expect(RICH.dismissals).toHaveLength(1);
    expect(RICH.declarations).toHaveLength(1);
    expect(RICH.adjustments).toHaveLength(1);
    expect(RICH.writeOffs).toHaveLength(1);
    expect(RICH.statements.some((s) => s.id.endsWith('-rebill'))).toBe(true);
  });

  it.each(ROUTES)('$name renders the same from its own parts as from the whole book', (r) => {
    const parts = bookPartsFor(r.tab, r.detail);
    const whole = screenText(r.ui, undefined);
    expect(whole.length).toBeGreaterThan(20);
    expect(screenText(r.ui, parts)).toBe(whole);
  });

  it('the harness sees a missing slice: the Overview on core alone differs from the whole book', () => {
    const whole = screenText(<OverviewTab showMoons />, undefined);
    expect(screenText(<OverviewTab showMoons />, new Set(['core']))).not.toBe(whole);
  });

  it('the Extractions detail needs the ledger for its dismissed days', () => {
    const whole = screenText(<MoonDetail id={SEP_ID} />, undefined);
    expect(screenText(<MoonDetail id={SEP_ID} />, new Set(['core']))).not.toBe(whole);
  });

  it('the Overview owes what the Miners tab owes, for a Miner who paid', () => {
    const view = viewOf(bookData(bookPartsFor('overview', null)));
    const sum = view.miners.reduce((total, m) => total + m.owed, 0);
    expect(view.totals.owed).toBe(sum);
    const whole = viewOf(bookData(undefined));
    const g1 = (v: typeof view) => v.miners.find((m) => m.id === 'g1')!;
    const billed = RICH.statements
      .filter((s) => s.minerId === 'g1')
      .reduce((total, s) => total + s.amount, 0);
    expect(g1(view).owed).toBeLessThan(billed);
    expect(g1(view).owed).toBe(g1(whole).owed);
    expect(view.totals.owed).toBe(whole.totals.owed);
    // What the Miners tab reads is the same row.
    const minersTab = viewOf(bookData(bookPartsFor('miners', null)));
    expect(g1(minersTab).owed).toBe(g1(view).owed);
    expect(minersTab.totals.owed).toBe(view.totals.owed);
  });
});
