import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import {
  overlayCorpBooks,
  type BookRowView,
  type PersonalBook,
  type PersonalOverlay,
} from '@/engine/corpTaxBook/personal';
import { flatten } from '../groupRows';
import type { MoonMiningTaxRow } from '../snapshot';
import {
  buildDisplayRows,
  corpPayee,
  corpPayeeAliases,
  corpPayeeId,
  corporationOfPayee,
  isBookRow,
  isCorpPayeeId,
  personalEntriesOf,
} from './corpRows';

const ME = 90000001;
const ZEO = 45490;

const mined = (date: string, over: Partial<MoonMiningTaxRow> = {}): MoonMiningTaxRow => ({
  characterId: ME,
  characterName: 'Kestrel Vane',
  entry: {
    characterId: ME,
    date,
    solarSystemId: 30003838,
    oreLines: [{ typeId: ZEO, quantity: 1000 }],
  },
  assignments: [],
  unassignedOreLines: [{ typeId: ZEO, quantity: 1000 }],
  ...over,
});

const assigned = (payeeId: string): MiningTaxAssignmentRecord => ({
  id: payeeId,
  characterId: ME,
  date: '2026-10-17',
  solarSystemId: 30003838,
  payeeId,
  oreLines: [{ typeId: ZEO, quantity: 1000 }],
  taxPct: 10,
  estimatedValue: 0,
  taxOwed: 0,
  status: 'outstanding',
  updatedAt: 1,
});

const view = (over: Partial<BookRowView> = {}): BookRowView => ({
  id: '98000001:90000001:1000:2026-10-17',
  corporationId: 98000001,
  corpName: 'Brass Meridian Logistics',
  characterId: ME,
  date: '2026-10-17',
  solarSystemId: 30003838,
  state: 'billed',
  oreLines: [{ typeId: ZEO, quantity: 1000 }],
  unitPrices: { [ZEO]: 100 },
  priceSources: { [ZEO]: 'saved' },
  taxPct: 15,
  rateScope: 'corp',
  estimatedValue: 100_000,
  taxOwed: 15_000,
  billed: 15_000,
  hubId: 'jita',
  oreForm: 'compressed',
  ...over,
});

const overlay = (over: Partial<PersonalOverlay> = {}): PersonalOverlay => ({
  rows: [],
  takenFromFree: new Map(),
  absorbed: new Map(),
  trimmed: new Map(),
  alsoBilled: new Map(),
  conflicted: new Map(),
  labels: new Map(),
  books: [],
  ...over,
});

const nameOf = () => 'Kestrel Vane';

describe('buildDisplayRows', () => {
  it('is exactly the personal tab with no overlay (D24: no book, nothing changes)', () => {
    const rows = [mined('2026-10-17')];
    expect(buildDisplayRows(rows, null, nameOf)).toEqual(flatten(rows));
  });

  it('removes the free ore a book took from the unassigned row, and drops it when nothing is left', () => {
    const key = `${ME}:2026-10-17:30003838`;
    const partly = buildDisplayRows(
      [mined('2026-10-17')],
      overlay({ takenFromFree: new Map([[key, [{ typeId: ZEO, quantity: 400 }]]]) }),
      nameOf
    );
    expect(partly[0].row.unassignedOreLines).toEqual([{ typeId: ZEO, quantity: 600 }]);
    // What the books took is kept, for a new Assignment to remember (it grows back in otherwise).
    expect(partly[0].row.bookTakenOreLines).toEqual([{ typeId: ZEO, quantity: 400 }]);
    const wholly = buildDisplayRows(
      [mined('2026-10-17')],
      overlay({ takenFromFree: new Map([[key, [{ typeId: ZEO, quantity: 1000 }]]]) }),
      nameOf
    );
    expect(wholly).toEqual([]);
  });

  it('hides the rows of a Payee that is the corporation, the book row stands in for them', () => {
    const key = `${ME}:2026-10-17:30003838`;
    const base = mined('2026-10-17');
    const row = {
      ...base,
      unassignedOreLines: [],
      assignments: [
        { ...assigned('bmw'), id: 'a1' },
        { ...assigned('ashfall'), id: 'a2' },
      ],
    };
    const out = buildDisplayRows(
      [row],
      overlay({ absorbed: new Map([[key, new Set(['a1'])]]) }),
      nameOf
    );
    expect(out.map((d) => d.assignment?.payeeId)).toEqual(['ashfall']);
  });

  it('shrinks an Assignment a book took part of to what stays with its Payee', () => {
    const key = `${ME}:2026-10-17:30003838`;
    const row = {
      ...mined('2026-10-17'),
      unassignedOreLines: [],
      assignments: [{ ...assigned('landlord'), estimatedValue: 100_000, taxOwed: 10_000 }],
    };
    const [out] = buildDisplayRows(
      [row],
      overlay({
        trimmed: new Map([
          [
            key,
            new Map([
              ['landlord', { oreLines: [{ typeId: ZEO, quantity: 250 }], valueShare: 0.25 }],
            ]),
          ],
        ]),
      }),
      nameOf
    );
    expect(out.assignment).toMatchObject({
      oreLines: [{ typeId: ZEO, quantity: 250 }],
      estimatedValue: 25_000,
      taxOwed: 2_500,
    });
  });

  it('labels the unassigned row Pending corp record or Unattributed', () => {
    const key = `${ME}:2026-10-17:30003838`;
    const [row] = buildDisplayRows(
      [mined('2026-10-17')],
      overlay({
        labels: new Map([
          [key, { state: 'pending' as const, corporationId: 98000001, corpName: 'Brass' }],
        ]),
      }),
      nameOf
    );
    expect(row.status).toBe('unassigned');
    expect(row.corp).toMatchObject({ kind: 'label', state: 'pending' });
    expect(isBookRow(row)).toBe(false);
  });

  it('adds one display-only row per book decision, owed to the virtual corp Payee', () => {
    const rows = buildDisplayRows(
      [],
      overlay({
        rows: [
          view(),
          view({ id: 'c', state: 'conflict', taxOwed: null }),
          view({ id: 'p', state: 'paid', taxOwed: 0 }),
          view({ id: 'd', state: 'dismissed', taxOwed: 0, dismissalReason: 'Fleet' }),
          view({ id: 'e', state: 'estimate', taxOwed: 9_000 }),
        ],
      }),
      nameOf
    );
    const byId = Object.fromEntries(rows.map((r) => [r.key, r]));
    const billed = byId['98000001:90000001:1000:2026-10-17'];
    expect(billed.status).toBe('outstanding');
    expect(billed.assignment?.payeeId).toBe(corpPayeeId(98000001));
    expect(billed.assignment?.taxOwed).toBe(15_000);
    expect(billed.row.characterName).toBe('Kestrel Vane');
    expect(isBookRow(billed)).toBe(true);
    // A conflict needs a decision but is not owed; paid and dismissed settle into History.
    expect(byId.c.status).toBe('needs-review');
    expect(byId.c.assignment?.taxOwed).toBe(0);
    expect(byId.p.status).toBe('paid');
    expect(byId.d.status).toBe('dismissed');
    // An open day's estimate is owed now, in Open, at its estimated figure.
    expect(byId.e.status).toBe('outstanding');
    expect(byId.e.assignment?.taxOwed).toBe(9_000);
  });

  it('a Paid day keeps the tax it was billed at, like every other Paid row; a dismissal stays 0', () => {
    const rows = buildDisplayRows(
      [],
      overlay({
        rows: [
          view({ id: 'p', state: 'paid', taxOwed: 0 }),
          view({
            id: 'pc',
            state: 'paid',
            taxOwed: 0,
            correction: { before: 15_000, after: 9_000, reasons: ['Goodwill'] },
          }),
          view({ id: 'd', state: 'dismissed', taxOwed: 0 }),
        ],
      }),
      nameOf
    );
    const byId = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byId.p.assignment?.taxOwed).toBe(15_000);
    expect(byId.pc.assignment?.taxOwed).toBe(9_000);
    expect(byId.d.assignment?.taxOwed).toBe(0);
  });
  it('names the refinery on the line, beside the corporation (#4622)', () => {
    const [row] = buildDisplayRows(
      [],
      overlay({ rows: [view({ refineryLabel: 'Ikao - Moon Drill' })] }),
      nameOf
    );
    expect(row.assignment?.label).toBe('Ikao - Moon Drill');
    const [unnamed] = buildDisplayRows([], overlay({ rows: [view()] }), nameOf);
    expect(unnamed.assignment?.label).toBeUndefined();
  });
});

describe('corpPayeeAliases', () => {
  const stored = (id: string, over: Partial<PayeeRecord> = {}): PayeeRecord => ({
    id,
    characterId: ME,
    name: 'Brass Meridian Logistics',
    defaultTaxPct: 10,
    updatedAt: 1,
    ...over,
  });
  const virtual = corpPayee(98000001, ME, 'Brass Meridian Logistics', 15, 'jita');

  it('points the book Payee at the stored Payee verified as the same corporation', () => {
    const aliases = corpPayeeAliases(
      [stored('mine', { entityId: 98000001, entityKind: 'corporation' })],
      [virtual]
    );
    expect(aliases).toEqual(new Map([[virtual.id, 'mine']]));
  });

  it('leaves it alone for a character or another corporation', () => {
    const aliases = corpPayeeAliases(
      [
        stored('char', { name: 'Someone', entityId: 98000001, entityKind: 'character' }),
        stored('other', { entityId: 98000002, entityKind: 'corporation' }),
      ],
      [virtual]
    );
    expect(aliases.size).toBe(0);
  });

  // A Payee missing its link on this device is still the corporation when named exactly as it.
  it('points the book Payee at an unlinked Payee named exactly as the corporation', () => {
    const aliases = corpPayeeAliases([stored('label')], [virtual]);
    expect(aliases.get(virtual.id)).toBe('label');
  });
});

describe('corp Payee ids', () => {
  it('round-trips the corporation and never looks like a personal Payee', () => {
    expect(isCorpPayeeId(corpPayeeId(98000001))).toBe(true);
    expect(corporationOfPayee(corpPayeeId(98000001))).toBe(98000001);
    expect(isCorpPayeeId('some-uuid')).toBe(false);
    expect(isCorpPayeeId(undefined)).toBe(false);
    expect(corpPayee(98000001, ME, 'Brass', 15, 'jita')).toMatchObject({
      id: corpPayeeId(98000001),
      entityId: 98000001,
      entityKind: 'corporation',
    });
  });
});

describe('personalEntriesOf', () => {
  it('hands the engine the free ore and the rates the member allocated at, leaving dismissals out', () => {
    const assignment = (over: Partial<MiningTaxAssignmentRecord>): MiningTaxAssignmentRecord => ({
      id: 'a',
      characterId: ME,
      date: '2026-10-17',
      solarSystemId: 30003838,
      payeeId: 'p1',
      oreLines: [{ typeId: ZEO, quantity: 600 }],
      taxPct: 10,
      estimatedValue: 0,
      taxOwed: 0,
      status: 'outstanding',
      updatedAt: 0,
      ...over,
    });
    const [entry] = personalEntriesOf([
      mined('2026-10-17', {
        assignments: [
          assignment({}),
          assignment({ id: 'b', status: 'dismissed', taxPct: 0, payeeId: undefined }),
        ],
        unassignedOreLines: [{ typeId: ZEO, quantity: 400 }],
      }),
    ]);
    expect(entry.freeOreLines).toEqual([{ typeId: ZEO, quantity: 400 }]);
    expect(entry.allocations).toEqual([
      {
        id: 'a',
        payeeId: 'p1',
        taxPct: 10,
        oreLines: [{ typeId: ZEO, quantity: 600 }],
        status: 'outstanding',
      },
    ]);
  });

  it('marks an unpaid Assignment a Default System made as releasable, and nothing else', () => {
    const base = {
      characterId: ME,
      date: '2026-10-17',
      solarSystemId: 30003838,
      payeeId: 'p1',
      oreLines: [{ typeId: ZEO, quantity: 600 }],
      taxPct: 10,
      estimatedValue: 0,
      taxOwed: 0,
      updatedAt: 0,
    };
    const [entry] = personalEntriesOf([
      mined('2026-10-17', {
        assignments: [
          { ...base, id: 'made', status: 'outstanding' as const, override: false },
          { ...base, id: 'paid', status: 'paid' as const, override: false },
          { ...base, id: 'mine', status: 'outstanding' as const },
        ],
      }),
    ]);
    expect(entry.allocations.map((a) => [a.id, a.releasable === true])).toEqual([
      ['made', true],
      ['paid', false],
      ['mine', false],
    ]);
  });
});

describe('ore a Corp Tax Book took off an entry (releasedTypeIds)', () => {
  const SYL = 45491;
  const COE = 45492;
  const CORP = 98000001;
  const SYSTEM = 30003838;
  const book = {
    corporationId: CORP,
    corpName: 'BUH',
    startDate: '2026-10-01',
    lastSyncedAt: '2026-10-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 15, effectiveFrom: '2026-10-01' }],
    miners: [],
    observed: [
      {
        characterId: ME,
        recordedCorporationId: CORP,
        structureId: 1000,
        date: '2026-10-17',
        solarSystemId: SYSTEM,
        oreLines: [{ typeId: ZEO, quantity: 51189 }],
      },
    ],
    dismissals: [],
    notices: [],
    payments: [],
    hubId: 'jita',
    oreForm: 'compressed',
    pricesOn: () => ({
      prices: new Map([
        [ZEO, 148],
        [SYL, 100],
        [COE, 100],
      ]),
      sources: new Map(),
    }),
    inFlight: [],
  } as unknown as PersonalBook;
  const entryLines = [
    { typeId: ZEO, quantity: 51189 },
    { typeId: SYL, quantity: 41809 },
    { typeId: COE, quantity: 7274 },
  ];
  const released: MiningTaxAssignmentRecord = {
    id: 'a1',
    characterId: ME,
    date: '2026-10-17',
    solarSystemId: SYSTEM,
    payeeId: 'star',
    taxPct: 10,
    oreLines: [
      { typeId: SYL, quantity: 41809 },
      { typeId: COE, quantity: 7274 },
    ],
    releasedTypeIds: [ZEO],
    status: 'outstanding',
    estimatedValue: 0,
    taxOwed: 0,
    updatedAt: 0,
  };

  it('hands the book the released ore as free, so it bills it instead of calling it a Conflict', () => {
    const row = mined('2026-10-17', {
      entry: { characterId: ME, date: '2026-10-17', solarSystemId: SYSTEM, oreLines: entryLines },
      assignments: [released],
      unassignedOreLines: [],
      releasedOreLines: [{ typeId: ZEO, quantity: 51189 }],
    });
    const [entry] = personalEntriesOf([row]);
    expect(entry.freeOreLines).toEqual([{ typeId: ZEO, quantity: 51189 }]);

    const out = overlayCorpBooks({
      now: '2026-10-18T14:00:00Z',
      books: [book],
      entries: [entry!],
    });
    expect(out.rows.map((r) => r.state)).not.toContain('conflict');
    expect(out.rows).toHaveLength(1);
    expect(out.takenFromFree.get(`${ME}:2026-10-17:${SYSTEM}`)).toEqual([
      { typeId: ZEO, quantity: 51189 },
    ]);
  });
});
