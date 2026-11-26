import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { buildBookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { draftNotice } from '@/engine/corpTaxBook/lateNotices';
import { extractionId } from '@/engine/corpTaxBook/sync';
import type { ObservedMiningEntry } from '@/engine/corpTaxBook/types';
import type { BookData, BookFeeder, BookPart, OfficerVerdict } from '../taxBook/bookClient';
import { bookPartsFor, readBook } from '../taxBook/bookRead';
import { BookProvider } from './BookContext';
import { ExtractionsTab } from './ExtractionsTab';
import { MinerDetail } from './MinerDetail';
import { MinersTab } from './MinersTab';
import { MoonDetail } from './MoonDetail';
import { MoonOwnerDetail } from './MoonOwnerDetail';
import { MoonOwnersTab } from './MoonOwnersTab';
import { OverviewTab } from './OverviewTab';
import { LateNoticesTab } from './LateNoticesTab';

type BookPartSet = ReadonlySet<BookPart>;
type BookDetailKind = NonNullable<Parameters<typeof bookPartsFor>[1]>;

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  getDoc: async (ref: { path: string }) => {
    const data = store.get(ref.path);
    return { exists: () => data !== undefined, data: () => data, get: () => undefined };
  },
  getDocs: async (ref: { path: string }) => {
    const prefix = `${ref.path}/`;
    const docs = [...store]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
    return { docs };
  },
  query: (ref: { path: string }) => ref,
  where: vi.fn(),
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn().mockResolvedValue(undefined) }));
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
  overdueDays: 14,
  hubId: 'jita',
  oreForm: 'compressed',
  structureExpiryHours: {},
  lastSyncedAt: SYNCED,
  rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
  entries: ENTRIES,
  miners: [{ id: 'g1', characterIds: [1, 2], mainCharacterId: 1 }],
  notices: [],
  payments: [],
  dismissals: [],
  declarations: [],
  adjustments: [],
  feeders: [FEEDER],
  extractions: [AUG, SEP, { ...AUG, structureId: 1003, moonId: 5 }],
  pricesOn: () => ({ prices: new Map([[ORE, 1000]]), sources: new Map() }),
};

function richBook() {
  const at = (now: string) => buildBookView({ ...base, now });
  const aug = at('2026-09-01T10:00:00Z');
  const issued = aug.miners.flatMap((m) => draftNotice(aug, m.id)?.notice ?? []);
  const augOnly = buildBookView({ ...base, notices: issued });
  const sep = buildBookView({ ...augOnly.input, now: '2026-10-02T10:00:00Z' });
  const septNotices = sep.miners
    .filter((m) => m.id !== 'solo:4')
    .flatMap((m) => draftNotice(sep, m.id)?.notice ?? [])
    .filter((n) => n.lines.length > 0);
  const dismissedDay = augOnly.charges.find(
    (c) => c.minerId === 'solo:4' && c.extractionId === SEP_ID
  )!;
  const of = (minerId: string) => issued.find((n) => n.minerId === minerId)!;
  const g1 = of('g1');
  const solo3 = of('solo:3');
  const solo4 = of('solo:4');
  const ledger = {
    payments: [
      {
        id: 'p1',
        minerId: 'g1',
        characterId: 1,
        amount: Math.round(g1.listed / 2),
        at: '2026-09-05T08:00:00Z',
        source: 'donation' as const,
      },
      {
        id: 'p2',
        minerId: 'solo:3',
        characterId: 3,
        amount: solo3.listed,
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
  return { lateNotices: [...issued, ...septNotices], ...ledger };
}

const RICH = richBook();

function seed() {
  const book = `corps/${CORP}`;
  store.clear();
  store.set(book, {
    active: true,
    startDate: base.startDate,
    graceHours: base.graceHours,
    overdueDays: base.overdueDays,
    hubId: base.hubId,
    oreForm: base.oreForm,
    rates: base.rates,
  });
  store.set(`${book}/meta/paid`, { ids: [] });
  store.set(`${book}/feeders/${MOON_OWNER}`, {
    ...FEEDER,
    payouts: undefined,
    lastReadWellAt: Date.parse(FEEDER.lastReadWellAt!),
  });
  base.extractions.forEach((x, i) => store.set(`${book}/extractions/e${i}`, { ...x }));
  const lists: Record<string, readonly { id: string }[]> = {
    miners: base.miners,
    lateNotices: RICH.lateNotices,
    payments: RICH.payments,
    dismissals: RICH.dismissals,
    declarations: RICH.declarations,
    adjustments: RICH.adjustments,
    writeOffs: RICH.writeOffs,
  };
  for (const [name, rows] of Object.entries(lists))
    for (const row of rows) store.set(`${book}/${name}/${row.id}`, row);
}

async function bookData(parts: BookPartSet | undefined): Promise<BookData> {
  seed();
  return (await readBook(7, CORP, { parts: parts ?? bookPartsFor() }))!;
}

function viewOf(data: BookData) {
  return buildBookView({
    ...base,
    notices: data.state.notices,
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

async function screenText(ui: ReactElement, parts: BookPartSet | undefined): Promise<string> {
  const data = await bookData(parts);
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
  { name: 'overview', tab: 'overview', detail: null, ui: <OverviewTab /> },
  { name: 'extractions', tab: 'extractions', detail: null, ui: <ExtractionsTab /> },
  { name: 'miners', tab: 'miners', detail: null, ui: <MinersTab /> },
  { name: 'late notices', tab: 'late-notices', detail: null, ui: <LateNoticesTab /> },
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
    name: 'moon owner',
    tab: 'moon-owners',
    detail: 'moonOwner',
    ui: <MoonOwnerDetail id={String(MOON_OWNER)} />,
  },
];

describe('book parts parity', () => {
  it('the rich book has a payment, dismissal, declaration, adjustment, write-off and notices', () => {
    expect(RICH.payments.length).toBeGreaterThan(1);
    expect(RICH.dismissals).toHaveLength(1);
    expect(RICH.declarations).toHaveLength(1);
    expect(RICH.adjustments).toHaveLength(1);
    expect(RICH.writeOffs).toHaveLength(1);
    expect(RICH.lateNotices.length).toBeGreaterThan(3);
  });

  it.each(ROUTES)('$name renders the same from its own parts as from the whole book', async (r) => {
    const parts = bookPartsFor(r.tab, r.detail);
    const whole = await screenText(r.ui, undefined);
    expect(whole.length).toBeGreaterThan(20);
    expect(await screenText(r.ui, parts)).toBe(whole);
  });

  it('the harness sees a missing slice: the Overview on core alone differs from the whole book', async () => {
    const whole = await screenText(<OverviewTab />, undefined);
    expect(await screenText(<OverviewTab />, new Set(['core']))).not.toBe(whole);
  });

  it('the Overview owes what the Miners tab owes, for a Miner who paid', async () => {
    const view = viewOf(await bookData(bookPartsFor('overview', null)));
    const sum = view.miners.reduce((total, m) => total + m.owed, 0);
    expect(view.totals.owed).toBe(sum);
    const whole = viewOf(await bookData(undefined));
    const g1 = (v: typeof view) => v.miners.find((m) => m.id === 'g1')!;
    const billed = RICH.lateNotices
      .filter((n) => n.minerId === 'g1')
      .reduce((total, n) => total + n.listed, 0);
    expect(g1(view).owed).toBeLessThan(billed);
    expect(g1(view).owed).toBe(g1(whole).owed);
    expect(view.totals.owed).toBe(whole.totals.owed);
    const minersTab = viewOf(await bookData(bookPartsFor('miners', null)));
    expect(g1(minersTab).owed).toBe(g1(view).owed);
    expect(minersTab.totals.owed).toBe(view.totals.owed);
  });
});
