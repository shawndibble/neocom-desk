import { describe, it, expect } from 'vitest';
import {
  learnRefinerySystems,
  learnedSystemsOf,
  officerLabelsOf,
  ownerRefinerySystemsToLearn,
  refineryFacts,
  refineryLabel,
  refineryLabeler,
  sourceCorporationOf,
} from './refinery';
import { groupObservedEntries, mergeObservedRows, observedRowKey } from './observed';
import type { ObservedRow } from './types';

const ATHANOR = 1_000_000_000_001;
const TATARA = 1_000_000_000_002;
const BOOK = 98000001;
const FEEDER = 98000002;

function row(overrides: Partial<ObservedRow> = {}): ObservedRow {
  return {
    structureId: ATHANOR,
    characterId: 90000001,
    recordedCorporationId: BOOK,
    typeId: 45490,
    date: '2026-10-01',
    quantity: 1000,
    cachedAt: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

describe('sourceCorporationOf', () => {
  it("reads an absent source as the book's own corporation", () => {
    expect(sourceCorporationOf(row(), BOOK)).toBe(BOOK);
  });

  it("reads a feeder's recorded source", () => {
    expect(sourceCorporationOf(row({ sourceCorporationId: FEEDER }), BOOK)).toBe(FEEDER);
  });
});

describe('two refineries in one system on one day', () => {
  const rows = [row(), row({ structureId: TATARA, sourceCorporationId: FEEDER })];

  it('keep their own rows and keys', () => {
    const { rows: merged } = mergeObservedRows([], rows);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map(observedRowKey)).size).toBe(2);
  });

  it('group into one entry per refinery, never merged', () => {
    const entries = groupObservedEntries(rows.map((r) => ({ ...r, solarSystemId: 30000142 })));
    expect(entries.map((e) => e.structureId)).toEqual([ATHANOR, TATARA]);
  });
});

describe('refineryLabel', () => {
  const base = { structureId: ATHANOR, feederName: 'Moon Owners Inc' };

  it('prefers the structure name when ESI let us read it', () => {
    expect(refineryLabel({ ...base, structureName: 'Jita Athanor', systemName: 'Jita' })).toEqual({
      label: 'Jita Athanor',
      source: 'structure',
    });
  });

  it('falls back to the system learned from the miner ledger', () => {
    expect(refineryLabel({ ...base, systemName: 'Jita' })).toEqual({
      label: 'Jita',
      source: 'system',
    });
  });

  it("falls back to the feeder's name plus the structure id", () => {
    expect(refineryLabel(base)).toEqual({
      label: `Moon Owners Inc ${ATHANOR}`,
      source: 'feeder',
    });
  });

  it('still tells two refineries apart with no names at all', () => {
    const a = refineryLabel({ structureId: ATHANOR }).label;
    const b = refineryLabel({ structureId: TATARA }).label;
    expect(a).not.toBe(b);
  });

  it('lets an officer label win, the last edit first', () => {
    const edits = [
      { label: 'Old', setAt: '2026-10-01T00:00:00Z' },
      { label: 'New', setAt: '2026-10-03T00:00:00Z' },
      { label: 'Mid', setAt: '2026-10-02T00:00:00Z' },
    ];
    expect(refineryLabel({ ...base, structureName: 'Jita Athanor', officerLabels: edits })).toEqual(
      { label: 'New', source: 'officer' }
    );
  });

  it('ignores a blank officer label', () => {
    const edits = [{ label: '  ', setAt: '2026-10-03T00:00:00Z' }];
    expect(refineryLabel({ ...base, systemName: 'Jita', officerLabels: edits }).source).toBe(
      'system'
    );
  });
});

describe('refineryLabeler', () => {
  const sources = {
    officerLabels: (id: number) =>
      id === TATARA ? [{ label: 'Tatara by the gate', setAt: '2026-10-03T00:00:00Z' }] : undefined,
    systemName: (id: number) => (id === ATHANOR ? 'Efa' : undefined),
  };

  it('runs every cell through the chain', () => {
    const label = refineryLabeler({ ...sources, ownerName: () => 'Moon Owners Inc' });
    expect(label(TATARA)).toBe('Tatara by the gate');
    expect(label(ATHANOR)).toBe('Efa');
    expect(label(42)).toBe('Moon Owners Inc 42');
  });

  it("never names the moon owner without an owner screen's name source (a miner's line)", () => {
    const label = refineryLabeler({ ...sources, fallback: (id) => `Refinery ${id}` });
    expect(label(42)).toBe('Refinery 42');
    expect(label(42)).not.toContain('Moon Owners');
  });

  it('uses the structure name before the system', () => {
    const label = refineryLabeler({ ...sources, structureName: () => 'Efa VII - Tatara' });
    expect(label(ATHANOR)).toBe('Efa VII - Tatara');
  });

  it('keeps the plain id when nothing is known and no fallback is given', () => {
    expect(refineryLabeler({})(42)).toBe('42');
  });
});

describe('refineryFacts', () => {
  it("reads each refinery's system and source corporation from its rows", () => {
    const facts = refineryFacts([
      row({ structureId: ATHANOR }),
      row({ structureId: ATHANOR, solarSystemId: 30000142 }),
      row({ structureId: TATARA, sourceCorporationId: FEEDER }),
    ]);
    expect(facts.systemOf.get(ATHANOR)).toBe(30000142);
    expect(facts.systemOf.has(TATARA)).toBe(false);
    expect(facts.sourceOf.get(TATARA)).toBe(FEEDER);
    expect(facts.sourceOf.has(ATHANOR)).toBe(false);
  });

  it('a moon owner refinery with no system on its rows gets one once a miner’s own ledger row matches it', () => {
    const rows = [row({ structureId: TATARA, sourceCorporationId: FEEDER, quantity: 700 })];
    expect(refineryFacts(rows).systemOf.has(TATARA)).toBe(false);
    const learned = ownerRefinerySystemsToLearn(groupObservedEntries(rows), [
      {
        characterId: 90000001,
        date: '2026-10-01',
        solarSystemId: 30002187,
        oreLines: [{ typeId: 45490, quantity: 700 }],
      },
    ]);
    expect(learned).toEqual({ [TATARA]: 30002187 });
    const stored = learnedSystemsOf([{ refinerySystems: { [String(TATARA)]: 30002187 } }]);
    expect(refineryFacts(rows, stored).systemOf.get(TATARA)).toBe(30002187);
  });

  it('a system a row carries wins over a learned one', () => {
    const rows = [row({ structureId: ATHANOR, solarSystemId: 30000142 })];
    expect(refineryFacts(rows, new Map([[ATHANOR, 30002187]])).systemOf.get(ATHANOR)).toBe(
      30000142
    );
  });
});

describe('ownerRefinerySystemsToLearn', () => {
  const own = {
    characterId: 90000001,
    date: '2026-10-01',
    solarSystemId: 30002187,
    oreLines: [{ typeId: 45490, quantity: 700 }],
  };

  it("leaves out the book's own refineries and those whose rows carry a system", () => {
    const entries = groupObservedEntries([
      row({ structureId: ATHANOR, quantity: 700 }),
      row({
        structureId: TATARA,
        sourceCorporationId: FEEDER,
        solarSystemId: 30000142,
        quantity: 700,
      }),
    ]);
    expect(ownerRefinerySystemsToLearn(entries, [own])).toEqual({});
  });
});

describe('learnedSystemsOf', () => {
  it("collects the systems learned on each moon owner's record", () => {
    const systems = learnedSystemsOf([
      { refinerySystems: { [String(TATARA)]: 30002187 } },
      {},
      { refinerySystems: { [String(ATHANOR)]: 30000142 } },
    ]);
    expect([...systems]).toEqual([
      [TATARA, 30002187],
      [ATHANOR, 30000142],
    ]);
  });
});

describe('officerLabelsOf', () => {
  it("collects each moon owner's stored labels by structure id", () => {
    const labels = officerLabelsOf([
      {
        refineryLabels: {
          [String(TATARA)]: { label: 'Gate', setAt: '2026-10-03T00:00:00Z' },
        },
      },
      {},
    ]);
    expect(labels.get(TATARA)).toEqual([{ label: 'Gate', setAt: '2026-10-03T00:00:00Z' }]);
    expect(labels.has(ATHANOR)).toBe(false);
  });
});

describe('learnRefinerySystems', () => {
  const personal = (
    characterId: number,
    date: string,
    solarSystemId: number,
    quantity: number
  ) => ({
    characterId,
    date,
    solarSystemId,
    oreLines: [{ typeId: 45490, quantity }],
  });

  it("matches a refinery's entry against the miner's own ledger entry", () => {
    const entries = groupObservedEntries([row({ quantity: 700 })]);
    expect(
      learnRefinerySystems(entries, [personal(90000001, '2026-10-01', 30000142, 700)])
    ).toEqual({ [ATHANOR]: 30000142 });
  });

  it('learns nothing when the ore does not match', () => {
    const entries = groupObservedEntries([row({ quantity: 700 })]);
    expect(
      learnRefinerySystems(entries, [personal(90000001, '2026-10-01', 30000142, 699)])
    ).toEqual({});
  });

  it('takes the most common system when matches disagree', () => {
    const entries = groupObservedEntries([
      row({ quantity: 700 }),
      row({ quantity: 800, date: '2026-10-02' }),
      row({ quantity: 900, date: '2026-10-03' }),
    ]);
    expect(
      learnRefinerySystems(entries, [
        personal(90000001, '2026-10-01', 30000144, 700),
        personal(90000001, '2026-10-02', 30000142, 800),
        personal(90000001, '2026-10-03', 30000142, 900),
      ])
    ).toEqual({ [ATHANOR]: 30000142 });
  });
});
