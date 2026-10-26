import { describe, expect, it } from 'vitest';
import { observedRowKey, type ObservedRow } from './corpTaxBookEngine.js';
import {
  lineKey,
  missingLines,
  rollupChanges,
  rollupDocId,
  rowsOfRollupDoc,
} from './corpTaxBookFeederRollup.js';

const row = (over: Partial<ObservedRow> = {}): ObservedRow => ({
  structureId: 77,
  characterId: 900,
  recordedCorporationId: 3,
  typeId: 18,
  date: '2026-10-18',
  quantity: 100,
  cachedAt: '2026-10-18T12:00:00.000Z',
  sourceCorporationId: 5,
  ...over,
});
const heldOf = (...rows: ObservedRow[]) => new Map(rows.map((r) => [observedRowKey(r), r]));

describe('rollupChanges', () => {
  it('sets a feeder row under its day and refinery document', () => {
    const out = rollupChanges([row(), row({ typeId: 19, solarSystemId: 30000142 })], heldOf());
    expect([...out.keys()]).toEqual([rollupDocId(5, 77, '2026-10-18')]);
    const c = out.get(rollupDocId(5, 77, '2026-10-18'))!;
    expect(c.set[lineKey(900, 18)]).toEqual({ quantity: 100, cachedAt: row().cachedAt });
    expect(c.set[lineKey(900, 19)].solarSystemId).toBe(30000142);
    expect(c.remove).toEqual([]);
  });

  it('writes nothing for a row with no feeder', () => {
    expect(rollupChanges([row({ sourceCorporationId: undefined })], heldOf()).size).toBe(0);
  });

  it('removes the entry from the old feeder when the row moved', () => {
    const out = rollupChanges([row({ sourceCorporationId: 6 })], heldOf(row()));
    expect(out.get(rollupDocId(5, 77, '2026-10-18'))?.remove).toEqual([lineKey(900, 18)]);
    expect(out.get(rollupDocId(6, 77, '2026-10-18'))?.set[lineKey(900, 18)]?.quantity).toBe(100);
  });

  it('removes the entry when a feeder row is replaced by the book own row', () => {
    const out = rollupChanges([row({ sourceCorporationId: undefined })], heldOf(row()));
    expect(out.get(rollupDocId(5, 77, '2026-10-18'))?.remove).toEqual([lineKey(900, 18)]);
    expect(out.size).toBe(1);
  });

  it('keeps the same feeder as a plain overwrite', () => {
    const out = rollupChanges([row({ quantity: 150 })], heldOf(row()));
    const c = out.get(rollupDocId(5, 77, '2026-10-18'))!;
    expect(c.remove).toEqual([]);
    expect(c.set[lineKey(900, 18)].quantity).toBe(150);
  });
});

describe('rowsOfRollupDoc', () => {
  it('unpacks lines into rows', () => {
    expect(
      rowsOfRollupDoc({
        structureId: 77,
        date: '2026-10-18',
        lines: {
          '900_18': { quantity: 100, cachedAt: 'x', solarSystemId: 30000142 },
          '901_19': { quantity: 5, cachedAt: 'x' },
        },
      })
    ).toEqual([
      {
        structureId: 77,
        characterId: 900,
        typeId: 18,
        date: '2026-10-18',
        quantity: 100,
        solarSystemId: 30000142,
      },
      { structureId: 77, characterId: 901, typeId: 19, date: '2026-10-18', quantity: 5 },
    ]);
  });

  it('skips malformed documents and lines', () => {
    expect(rowsOfRollupDoc({ lines: {} })).toEqual([]);
    expect(
      rowsOfRollupDoc({ structureId: 1, date: 'd', lines: { bad: { quantity: 1 }, '1_2': {} } })
    ).toEqual([]);
  });
});

describe('missingLines', () => {
  it('adds only the entries the document does not hold', () => {
    const out = missingLines({ '900_18': { quantity: 999 } }, [row(), row({ typeId: 19 })]);
    expect(Object.keys(out)).toEqual(['900_19']);
  });

  it('adds everything to an absent document', () => {
    expect(Object.keys(missingLines(undefined, [row()]))).toEqual(['900_18']);
  });
});
