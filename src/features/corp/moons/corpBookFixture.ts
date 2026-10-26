/**
 * Sample Corp Tax Book for the section pages' stories (#5247): a view built by the real engine
 * (`buildBookView`) from invented entries and handed to the real tabs and pages through
 * `BookProvider`, so the stories are the shipped components.
 */
import {
  buildBookView,
  nextRunPeriod,
  planStatementRun,
  statementForLine,
  type BookView,
} from '@/engine/corpTaxBook/bookView';
import { extractionId } from '@/engine/corpTaxBook/sync';
import type { ObservedMiningEntry } from '@/engine/corpTaxBook/types';
import type { BookSettings, OfficerVerdict } from '@/features/corp/taxBook/bookClient';

export const CORP_ID = 98000001;
const CHARS: Record<number, string> = {
  1: 'Varro Kestane',
  2: 'Lysa Kestane',
  3: 'Odile Marchetti',
  4: 'Tamsin Holloway',
  5: 'Juno Rask',
  6: 'Bram Ostrander',
  7: 'Ilse Verne',
};
const ORES: Record<number, [string, number]> = {
  1: ['Zeolites', 148.2],
  2: ['Sylvite', 171.9],
  3: ['Cobaltite', 412.75],
  4: ['Bitumens', 162.4],
};
const ANVIL = 1001;
const KILN = 1002;
const DRILL = 1003;
const MOONS: Record<number, string> = {
  3: 'Efa V - Moon 3',
  4: 'Efa VII - Moon 1',
  5: 'Kamela IV - Moon 6',
  6: 'Kamela II - Moon 2',
};

const entry = (
  characterId: number,
  date: string,
  structureId: number,
  ore: number,
  quantity: number
): ObservedMiningEntry => ({
  characterId,
  recordedCorporationId: characterId === 7 ? 555 : CORP_ID,
  structureId,
  moonId: structureId === ANVIL ? 3 : 4,
  date,
  oreLines: [{ typeId: ore, quantity }],
});

const ENTRIES = [
  entry(1, '2026-08-14', ANVIL, 1, 96_600),
  entry(1, '2026-08-27', KILN, 3, 71_300),
  entry(2, '2026-08-27', KILN, 3, 66_150),
  entry(1, '2026-08-28', KILN, 3, 71_300),
  entry(1, '2026-09-04', ANVIL, 2, 70_300),
  entry(2, '2026-09-25', ANVIL, 1, 91_500),
  entry(1, '2026-09-26', ANVIL, 2, 82_000),
  {
    ...entry(1, '2026-10-17', ANVIL, 1, 61_900),
    oreLines: [
      { typeId: 1, quantity: 61_900 },
      { typeId: 2, quantity: 52_100 },
    ],
  },
  entry(2, '2026-10-18', ANVIL, 1, 38_400),
  entry(3, '2026-08-13', ANVIL, 1, 140_000),
  entry(3, '2026-09-03', ANVIL, 2, 120_000),
  entry(3, '2026-09-25', ANVIL, 1, 150_000),
  entry(3, '2026-10-17', ANVIL, 2, 161_050),
  entry(4, '2026-08-12', ANVIL, 1, 88_000),
  entry(4, '2026-09-03', ANVIL, 1, 64_000),
  entry(4, '2026-10-17', ANVIL, 2, 70_000),
  entry(4, '2026-10-18', ANVIL, 1, 41_000),
  entry(5, '2026-10-17', ANVIL, 2, 64_800),
  entry(6, '2026-08-13', ANVIL, 4, 99_000),
  entry(6, '2026-09-25', ANVIL, 4, 77_000),
  entry(7, '2026-09-04', ANVIL, 1, 45_000),
  entry(7, '2026-10-17', ANVIL, 1, 52_000),
];

const ext = (start: string, arrival: string, decay: string, fired?: string) => ({
  structureId: ANVIL,
  moonId: 3,
  extractionStartTime: start,
  chunkArrivalTime: arrival,
  naturalDecayTime: decay,
  ...(fired ? { laserFiredAt: fired } : {}),
  oreLines: [
    { typeId: 1, quantity: 600_000 },
    { typeId: 2, quantity: 400_000 },
  ],
});
const EXTRACTIONS = [
  ext('2026-07-30T10:00:00Z', '2026-08-12T10:00:00Z', '2026-08-14T10:00:00Z'),
  ext('2026-08-13T10:00:00Z', '2026-09-03T10:00:00Z', '2026-09-05T10:00:00Z'),
  ext('2026-09-04T10:00:00Z', '2026-09-25T10:00:00Z', '2026-09-27T10:00:00Z'),
  ext(
    '2026-09-26T10:00:00Z',
    '2026-10-17T10:00:00Z',
    '2026-10-19T10:00:00Z',
    '2026-10-17T15:00:00Z'
  ),
  {
    structureId: KILN,
    moonId: 4,
    extractionStartTime: '2026-08-10T10:00:00Z',
    chunkArrivalTime: '2026-08-27T10:00:00Z',
    naturalDecayTime: '2026-08-29T10:00:00Z',
    oreLines: [{ typeId: 3, quantity: 300_000 }],
  },
  // Ready: the chunk has arrived, the laser has not fired.
  {
    structureId: KILN,
    moonId: 4,
    extractionStartTime: '2026-10-04T10:00:00Z',
    chunkArrivalTime: '2026-10-18T10:00:00Z',
    naturalDecayTime: '2026-10-20T13:00:00Z',
    oreLines: [{ typeId: 3, quantity: 280_000 }],
  },
  // Extracting, arriving within the week and beyond it.
  {
    structureId: DRILL,
    moonId: 5,
    extractionStartTime: '2026-10-10T10:00:00Z',
    chunkArrivalTime: '2026-10-22T23:00:00Z',
    naturalDecayTime: '2026-10-23T02:00:00Z',
    oreLines: [],
  },
  {
    structureId: DRILL,
    moonId: 6,
    extractionStartTime: '2026-10-16T10:00:00Z',
    chunkArrivalTime: '2026-11-10T10:00:00Z',
    naturalDecayTime: '2026-11-10T13:00:00Z',
    oreLines: [{ typeId: 4, quantity: 250_000 }],
  },
];

const base = {
  corporationId: CORP_ID,
  now: '2026-10-18T14:00:00Z',
  startDate: '2026-08-01',
  graceHours: 6,
  minimumStatement: 0,
  overdueDays: 14,
  cadence: { kind: 'monthly' as const },
  hubId: 'jita',
  oreForm: 'compressed' as const,
  structureExpiryHours: {},
  lastSyncedAt: '2026-10-18T12:00:00Z',
  rates: [{ scope: 'corp' as const, pct: 10, effectiveFrom: '2026-08-01' }],
  entries: ENTRIES,
  miners: [{ id: 'g1', characterIds: [1, 2], mainCharacterId: 1 }],
  statements: [],
  payments: [],
  dismissals: [],
  declarations: [],
  adjustments: [],
  extractions: EXTRACTIONS,
  paidStatementIds: new Set<string>(),
  pricesOn: () => ({
    prices: new Map(Object.entries(ORES).map(([id, [, p]]) => [Number(id), p])),
    sources: new Map(),
  }),
};

function build(): BookView {
  const first = buildBookView(base);
  const period = nextRunPeriod(first);
  const plan = period ? planStatementRun(first, period) : undefined;
  const statements = plan
    ? plan.lines.map((l) => ({
        ...statementForLine(first, plan, l),
        issuedAt: '2026-09-01T10:00:00Z',
      }))
    : [];
  const tam = statements.find((s) => s.minerId === 'solo:4');
  const odile = statements.find((s) => s.minerId === 'solo:3');
  const varro = statements.find((s) => s.minerId === 'g1');
  const payments = [
    {
      id: 'u1',
      characterId: 99,
      amount: 15_000_000,
      at: '2026-10-16T08:12:00Z',
      source: 'donation' as const,
    },
    ...(varro
      ? [
          {
            id: 'p3',
            minerId: 'g1',
            characterId: 1,
            amount: 3_000_000,
            at: '2026-09-16T08:00:00Z',
            source: 'donation' as const,
          },
        ]
      : []),
    ...(odile
      ? [
          {
            id: 'p1',
            minerId: 'solo:3',
            characterId: 3,
            amount: odile.amount,
            at: '2026-09-10T08:00:00Z',
            source: 'donation' as const,
          },
        ]
      : []),
    ...(tam
      ? [
          {
            id: 'p2',
            minerId: 'solo:4',
            characterId: 4,
            amount: Math.round(tam.amount / 2),
            at: '2026-09-12T08:00:00Z',
            source: 'donation' as const,
          },
        ]
      : []),
  ];
  return buildBookView({
    ...base,
    statements,
    payments,
    paidStatementIds: new Set(odile ? [odile.id] : []),
  });
}

export const BOOK_VIEW = build();
export const VARRO_ID = 'g1';
export const MOON_ID = extractionId({
  structureId: ANVIL,
  extractionStartTime: '2026-09-26T10:00:00Z',
});

const verdict: OfficerVerdict = {
  corporationId: CORP_ID,
  isCeo: true,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: true,
  bookActive: true,
  expiresAt: 0,
};

const REFINERIES: Record<number, string> = {
  [ANVIL]: 'Efa V - Moon 3 - Brass Anvil',
  [KILN]: 'Efa VII - Moon 1 - Copper Kiln',
  [DRILL]: 'Kamela - Meridian Drill',
};

const NAMES = {
  character: (id: number) => CHARS[id] ?? `Pilot ${id}`,
  corporation: (id: number) => `Corp ${id}`,
  refinery: (id: number) => REFINERIES[id] ?? `Refinery ${id}`,
  ownerRefinery: (id: number) => REFINERIES[id] ?? `Refinery ${id}`,
  moon: (id: number) => MOONS[id] ?? `Moon ${id}`,
  ore: (id: number) => ORES[id]?.[0] ?? `Ore ${id}`,
};

/** What the real `BookProvider` takes, for the "today" stories. */
export const BOOK_CONTEXT = {
  characterId: 1,
  corporationId: CORP_ID,
  view: BOOK_VIEW,
  names: NAMES,
  settings: { minimumStatement: 0 } as BookSettings,
  data: {
    adjustments: [],
    declarations: [],
    observed: [],
    state: { miners: base.miners },
    groupingAnswers: [],
  } as never,
  verdict,
  reload: () => {},
};
