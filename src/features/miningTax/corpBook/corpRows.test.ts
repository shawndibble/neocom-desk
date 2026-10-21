import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { BookRowView, PersonalOverlay } from '@/engine/corpTaxBook/personal';
import { flatten } from '../groupRows';
import type { MoonMiningTaxRow } from '../snapshot';
import {
  buildDisplayRows,
  corpPayee,
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
    const wholly = buildDisplayRows(
      [mined('2026-10-17')],
      overlay({ takenFromFree: new Map([[key, [{ typeId: ZEO, quantity: 1000 }]]]) }),
      nameOf
    );
    expect(wholly).toEqual([]);
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

describe('corp Payee ids', () => {
  it('round-trips the corporation and never looks like a personal Payee', () => {
    expect(isCorpPayeeId(corpPayeeId(98000001))).toBe(true);
    expect(corporationOfPayee(corpPayeeId(98000001))).toBe(98000001);
    expect(isCorpPayeeId('some-uuid')).toBe(false);
    expect(isCorpPayeeId(undefined)).toBe(false);
    expect(corpPayee(98000001, ME, 'Brass (Corp Tax Book)', 15, 'jita')).toMatchObject({
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
        payeeId: 'p1',
        taxPct: 10,
        oreLines: [{ typeId: ZEO, quantity: 600 }],
        status: 'outstanding',
      },
    ]);
  });
});
