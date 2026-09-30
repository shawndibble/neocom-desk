import { describe, expect, it } from 'vitest';
import {
  buildTheraConnectionRows,
  filterTheraConnections,
  jumpsSortValue,
  type TheraConnection,
} from './theraConnections';

const NOW = Date.parse('2026-09-30T09:00:00Z');
const HOUR = 3_600_000;

function connection(overrides: Partial<TheraConnection> = {}): TheraConnection {
  return {
    id: '1',
    hub: 'thera',
    hubSignature: 'ABC-123',
    exitSignature: 'XYZ-789',
    exitSystemId: 30002676,
    exitSystemName: 'Parchanier',
    exitClass: 'hs',
    exitRegionName: 'Heimatar',
    wormholeType: 'Q063',
    maxShipSize: 'medium',
    expiresAt: NOW + 5 * HOUR,
    ...overrides,
  };
}

const SYSTEMS = new Map([
  [30002676, { security: 0.62 }],
  // Shows as 0.5 in game, so highsec, whatever the feed's class letters say.
  [30003807, { security: 0.46 }],
  [30004629, { security: -0.3 }],
  [31000629, { security: -0.99 }],
]);

const NO_ORIGIN = { kind: 'no-origin' } as const;

describe('buildTheraConnectionRows', () => {
  it('hides a connection that has already collapsed', () => {
    const rows = buildTheraConnectionRows(
      [connection({ id: 'gone', expiresAt: NOW }), connection({ id: 'live' })],
      { now: NOW, systems: SYSTEMS, distances: NO_ORIGIN }
    );
    expect(rows.map((row) => row.id)).toEqual(['live']);
  });

  it('flags remaining life of two hours or less, and not more', () => {
    const rows = buildTheraConnectionRows(
      [
        connection({ id: 'two', expiresAt: NOW + 2 * HOUR }),
        connection({ id: 'more', expiresAt: NOW + 2 * HOUR + 1 }),
      ],
      { now: NOW, systems: SYSTEMS, distances: NO_ORIGIN }
    );
    expect(rows.map((row) => [row.id, row.remainingMs, row.lifeWarning])).toEqual([
      ['two', 2 * HOUR, true],
      ['more', 2 * HOUR + 1, false],
    ]);
  });

  it('bands a k-space exit on its shown security, not on the feed class', () => {
    const [row] = buildTheraConnectionRows(
      [connection({ exitSystemId: 30003807, exitSystemName: 'Dour', exitClass: 'ls' })],
      { now: NOW, systems: SYSTEMS, distances: NO_ORIGIN }
    );
    expect(row).toMatchObject({ exitSecurity: 0.46, exitSpace: 'highsec' });
  });

  it('bands a J-space exit as wormhole space whatever its security', () => {
    const [row] = buildTheraConnectionRows(
      [connection({ exitSystemId: 31000629, exitSystemName: 'J120704', exitClass: 'c2' })],
      { now: NOW, systems: SYSTEMS, distances: NO_ORIGIN }
    );
    expect(row.exitSpace).toBe('wormhole');
  });

  it('falls back to the feed class when the system snapshot has no entry', () => {
    const rows = buildTheraConnectionRows(
      [
        connection({ id: 'ns', exitSystemId: 1, exitClass: 'ns' }),
        connection({ id: 'c4', exitSystemId: 2, exitSystemName: 'J130343', exitClass: 'c4' }),
        connection({ id: 'none', exitSystemId: 3, exitClass: null }),
      ],
      { now: NOW, systems: new Map(), distances: NO_ORIGIN }
    );
    expect(rows.map((row) => [row.exitSecurity, row.exitSpace])).toEqual([
      [null, 'nullsec'],
      [null, 'wormhole'],
      [null, null],
    ]);
  });

  it('looks up each exit in one distance sweep, keeping no route apart from unknown', () => {
    const distances = {
      kind: 'known' as const,
      jumps: new Map([
        [30002676, 7],
        [30004629, 0],
      ]),
    };
    const rows = buildTheraConnectionRows(
      [
        connection({ id: 'reach' }),
        connection({ id: 'here', exitSystemId: 30004629, exitClass: 'ns' }),
        connection({ id: 'island', exitSystemId: 30003807, exitClass: 'ls' }),
        connection({
          id: 'jspace',
          exitSystemId: 31000629,
          exitSystemName: 'J120704',
          exitClass: 'c2',
        }),
      ],
      { now: NOW, systems: SYSTEMS, distances }
    );
    expect(Object.fromEntries(rows.map((row) => [row.id, row.jumps]))).toEqual({
      reach: { kind: 'known', jumps: 7 },
      here: { kind: 'known', jumps: 0 },
      island: { kind: 'no-route' },
      jspace: { kind: 'no-route' },
    });
  });

  it('says unknown for every row when the stargate map could not be read', () => {
    const [row] = buildTheraConnectionRows([connection()], {
      now: NOW,
      systems: SYSTEMS,
      distances: { kind: 'unknown' },
    });
    expect(row.jumps).toEqual({ kind: 'unknown' });
  });

  it('says no origin, not unknown, when no starting system is chosen', () => {
    const [row] = buildTheraConnectionRows([connection()], {
      now: NOW,
      systems: SYSTEMS,
      distances: NO_ORIGIN,
    });
    expect(row.jumps).toEqual({ kind: 'no-origin' });
  });
});

describe('filterTheraConnections', () => {
  const rows = buildTheraConnectionRows(
    [
      connection({ id: 'thera-hs-medium' }),
      connection({
        id: 'turnur-ns-capital',
        hub: 'turnur',
        exitSystemId: 30004629,
        exitClass: 'ns',
        maxShipSize: 'capital',
      }),
      connection({
        id: 'thera-c2-large',
        exitSystemId: 31000629,
        exitSystemName: 'J120704',
        exitClass: 'c2',
        maxShipSize: 'large',
      }),
      connection({ id: 'thera-hs-unsized', maxShipSize: null }),
    ],
    { now: NOW, systems: SYSTEMS, distances: NO_ORIGIN }
  );
  const ids = (filter: Parameters<typeof filterTheraConnections>[1]) =>
    filterTheraConnections(rows, filter).map((row) => row.id);
  const ALL = { hub: 'all', space: 'all', shipSize: 'any' } as const;

  it('passes everything with no filter set', () => {
    expect(ids(ALL)).toHaveLength(4);
  });

  it('filters by hub', () => {
    expect(ids({ ...ALL, hub: 'turnur' })).toEqual(['turnur-ns-capital']);
  });

  it('filters by the exit security band', () => {
    expect(ids({ ...ALL, space: 'highsec' })).toEqual(['thera-hs-medium', 'thera-hs-unsized']);
    expect(ids({ ...ALL, space: 'wormhole' })).toEqual(['thera-c2-large']);
  });

  it('keeps connections that pass at least the chosen ship size, dropping unsized ones', () => {
    expect(ids({ ...ALL, shipSize: 'large' })).toEqual(['turnur-ns-capital', 'thera-c2-large']);
    expect(ids({ ...ALL, shipSize: 'medium' })).toEqual([
      'thera-hs-medium',
      'turnur-ns-capital',
      'thera-c2-large',
    ]);
  });
});

describe('jumpsSortValue', () => {
  it('sorts known distances and leaves every other state for the end', () => {
    const [known] = buildTheraConnectionRows([connection()], {
      now: NOW,
      systems: SYSTEMS,
      distances: { kind: 'known', jumps: new Map([[30002676, 4]]) },
    });
    const [none] = buildTheraConnectionRows([connection()], {
      now: NOW,
      systems: SYSTEMS,
      distances: { kind: 'unknown' },
    });
    expect(jumpsSortValue(known)).toBe(4);
    expect(jumpsSortValue(none)).toBeUndefined();
  });
});
