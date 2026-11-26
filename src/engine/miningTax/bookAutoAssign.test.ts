import { describe, expect, it } from 'vitest';
import type { ObservedMiningEntry } from '../corpTaxBook/types';
import {
  planBookAutoAssign,
  type AutoAssignBook,
  type AutoAssignCovering,
  type BookAutoAssignInput,
} from './bookAutoAssign';
import type { MiningLedgerEntry } from './types';

const CORP = 98000001;
const OTHER_CORP = 98000002;
const CHAR = 9001;
const SYSTEM = 30001;
const DAY = '2026-11-25';
const NOW = '2026-11-25T12:00:00.000Z';
const REFINERY = 1022;

const entry = (over: Partial<MiningLedgerEntry> = {}): MiningLedgerEntry => ({
  characterId: CHAR,
  date: DAY,
  solarSystemId: SYSTEM,
  oreLines: [
    { typeId: 45490, quantity: 1000 },
    { typeId: 45491, quantity: 500 },
  ],
  ...over,
});

const observed = (over: Partial<ObservedMiningEntry> = {}): ObservedMiningEntry => ({
  characterId: CHAR,
  recordedCorporationId: CORP,
  structureId: REFINERY,
  date: DAY,
  solarSystemId: SYSTEM,
  oreLines: [{ typeId: 45490, quantity: 1000 }],
  ...over,
});

const book = (over: Partial<AutoAssignBook> = {}): AutoAssignBook => ({
  corporationId: CORP,
  corpName: 'Moon Corp',
  characterIds: [CHAR],
  memberCharacterIds: [CHAR],
  startDate: '2026-11-01',
  graceHours: 0.5,
  lastSyncedAt: '2026-11-25T11:00:00.000Z',
  rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-11-01' }],
  miners: [{ id: 'm1', characterIds: [CHAR], mainCharacterId: CHAR }],
  observed: [observed()],
  structureNames: { [REFINERY]: 'Moon Corp Athanor' },
  ...over,
});

const corpPayee = {
  id: 'p-corp',
  characterId: CHAR,
  name: 'Moon Corp',
  entityId: CORP,
  entityKind: 'corporation' as const,
};
const otherPayee = {
  id: 'p-other',
  characterId: CHAR,
  name: 'Someone',
  entityId: 7,
  entityKind: 'character' as const,
};

const covering = (over: Partial<AutoAssignCovering> = {}): AutoAssignCovering => ({
  id: 'a1',
  characterId: CHAR,
  date: DAY,
  solarSystemId: SYSTEM,
  payeeId: otherPayee.id,
  oreLines: [{ typeId: 45490, quantity: 1000 }],
  status: 'outstanding',
  ...over,
});

const plan = (over: Partial<BookAutoAssignInput> = {}) =>
  planBookAutoAssign({
    entries: [entry()],
    assignments: [],
    books: [book()],
    payees: [corpPayee, otherPayee],
    optedOut: new Set(),
    now: NOW,
    ...over,
  });

describe('planBookAutoAssign', () => {
  it('assigns unassigned ore in a one-book system on an open day to the corp Payee', () => {
    expect(plan()).toEqual([
      {
        corporationId: CORP,
        characterId: CHAR,
        date: DAY,
        solarSystemId: SYSTEM,
        minerId: 'm1',
        payeeId: 'p-corp',
        taxPct: 10,
        rateScope: 'corp',
        label: 'Moon Corp Athanor',
        oreLines: entry().oreLines,
        entryOreLines: entry().oreLines,
        takeovers: [],
      },
    ]);
  });

  it('uses the most specific book rate for the miner', () => {
    const [slice] = plan({
      books: [
        book({
          rates: [
            { scope: 'corp', pct: 10, effectiveFrom: '2026-11-01' },
            { scope: 'miner', minerId: 'm1', pct: 4, effectiveFrom: '2026-11-01' },
          ],
        }),
      ],
    });
    expect(slice).toMatchObject({ taxPct: 4, rateScope: 'miner' });
  });

  it('labels with the refinery the book saw the miner at before when not yet seen today', () => {
    const [slice] = plan({
      books: [
        book({
          observed: [observed({ date: '2026-11-20', structureId: 2033 })],
          structureNames: { 2033: 'Older Athanor' },
        }),
      ],
    });
    expect(slice?.label).toBe('Older Athanor');
  });

  it('leaves the label off when the refinery has no name, so the system shows', () => {
    const [slice] = plan({ books: [book({ structureNames: {} })] });
    expect(slice).not.toHaveProperty('label');
  });

  it('leaves the payee to be created when the miner has no corp Payee', () => {
    const [slice] = plan({ payees: [otherPayee] });
    expect(slice).not.toHaveProperty('payeeId');
  });

  it('leaves a hand-made assignment alone', () => {
    expect(plan({ assignments: [covering()] })).toEqual([]);
  });

  it('leaves a hand-made split alone', () => {
    expect(
      plan({
        assignments: [
          covering({ id: 'a1', oreLines: [{ typeId: 45490, quantity: 1000 }] }),
          covering({
            id: 'a2',
            payeeId: corpPayee.id,
            oreLines: [{ typeId: 45491, quantity: 500 }],
          }),
        ],
      })
    ).toEqual([]);
  });

  it('overrides an unpaid Default-System assignment to another Payee', () => {
    const [slice] = plan({
      assignments: [
        covering({
          override: false,
          oreLines: [
            { typeId: 45491, quantity: 500 },
            { typeId: 45490, quantity: 1000 },
          ],
        }),
      ],
    });
    expect(slice?.takeovers).toEqual([{ assignmentId: 'a1', typeIds: [45490, 45491] }]);
    expect(slice?.oreLines).toEqual(entry().oreLines);
  });

  it('counts a Default-System assignment to the corp Payee as assigned', () => {
    expect(plan({ assignments: [covering({ override: false, payeeId: corpPayee.id })] })).toEqual(
      []
    );
  });

  it('counts a paid Default-System assignment as assigned', () => {
    expect(plan({ assignments: [covering({ override: false, status: 'paid' })] })).toEqual([]);
  });

  it('leaves a two-book system Pending', () => {
    const second = book({
      corporationId: OTHER_CORP,
      corpName: 'Second Corp',
      observed: [observed({ recordedCorporationId: OTHER_CORP, structureId: 3044 })],
    });
    expect(plan({ books: [book(), second] })).toEqual([]);
  });

  it('assigns only in systems where the book has a refinery', () => {
    expect(plan({ entries: [entry({ solarSystemId: 30002 })] })).toEqual([]);
  });

  it('counts a refinery another miner was seen at', () => {
    const [slice] = plan({
      books: [book({ observed: [observed({ characterId: 777 })] })],
    });
    expect(slice).toMatchObject({ corporationId: CORP, payeeId: 'p-corp' });
  });

  it('skips a miner the book does not cover', () => {
    expect(plan({ books: [book({ characterIds: [1234] })] })).toEqual([]);
  });

  it('skips a day before the book started', () => {
    expect(plan({ books: [book({ startDate: '2026-11-26' })] })).toEqual([]);
  });

  it('skips a day the book has closed', () => {
    expect(
      plan({
        entries: [entry({ date: '2026-11-23' })],
        books: [book({ observed: [observed({ date: '2026-11-23' })] })],
      })
    ).toEqual([]);
  });

  it('skips an entry the pilot opted out of', () => {
    expect(plan({ optedOut: new Set([`${CHAR}|${DAY}|${SYSTEM}`]) })).toEqual([]);
  });

  it('skips a dismissed entry', () => {
    expect(plan({ assignments: [covering({ override: false, status: 'dismissed' })] })).toEqual([]);
  });

  it('skips when no book rate applies', () => {
    expect(plan({ books: [book({ rates: [] })] })).toEqual([]);
  });

  it('rates a non-member as a guest', () => {
    const [slice] = plan({
      books: [
        book({
          memberCharacterIds: [],
          observed: [observed({ characterId: 777 })],
          rates: [
            { scope: 'corp', pct: 10, effectiveFrom: '2026-11-01' },
            { scope: 'guest', pct: 15, effectiveFrom: '2026-11-01' },
          ],
        }),
      ],
    });
    expect(slice).toMatchObject({ taxPct: 15, rateScope: 'guest' });
  });
});
