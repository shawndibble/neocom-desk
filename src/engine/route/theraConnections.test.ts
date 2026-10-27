import { describe, expect, it } from 'vitest';
import {
  buildTheraConnectionRows,
  countTheraConnectionsByHub,
  filterTheraConnections,
  jumpsSortValue,
  longestLifeFirst,
  THERA_EXITS,
  type TheraConnection,
  type TheraExit,
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

  it('says no gate route for a J-space exit even with no origin or no stargate map', () => {
    const jspace = connection({
      exitSystemId: 31000629,
      exitSystemName: 'J120704',
      exitClass: 'c2',
    });
    for (const distances of [NO_ORIGIN, { kind: 'unknown' } as const]) {
      const [row] = buildTheraConnectionRows([jspace], { now: NOW, systems: SYSTEMS, distances });
      expect(row.jumps).toEqual({ kind: 'no-route' });
    }
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
  const ALL = { hub: 'all', shipSize: 'any' } as const;

  it('passes everything with no filter set', () => {
    expect(ids(ALL)).toHaveLength(4);
  });

  it('filters by hub', () => {
    expect(ids({ ...ALL, hub: 'turnur' })).toEqual(['turnur-ns-capital']);
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

describe('filterTheraConnections by exit', () => {
  const rows = buildTheraConnectionRows(
    [
      connection({ id: 'hs' }),
      connection({ id: 'shown-hs', exitSystemId: 30003807, exitClass: 'ls' }),
      connection({ id: 'ls', exitSystemId: 9, exitClass: 'ls' }),
      connection({ id: 'ns', exitSystemId: 30004629, exitClass: 'ns' }),
      connection({
        id: 'c2',
        exitSystemId: 31000629,
        exitSystemName: 'J120704',
        exitClass: 'c2',
      }),
      connection({ id: 'untold', exitSystemId: 3, exitClass: null }),
    ],
    { now: NOW, systems: SYSTEMS, distances: NO_ORIGIN }
  );
  const ids = (exit: TheraExit) =>
    filterTheraConnections(rows, { hub: 'all', shipSize: 'any', exit }).map((row) => row.id);

  it('keeps every exit outside J-space under K-space, one whose band nothing can tell included', () => {
    expect(ids('kspace')).toEqual(['hs', 'shown-hs', 'ls', 'ns', 'untold']);
  });

  it('keeps one band, on the security the exit shows', () => {
    expect(ids('highsec')).toEqual(['hs', 'shown-hs']);
    expect(ids('lowsec')).toEqual(['ls']);
    expect(ids('nullsec')).toEqual(['ns']);
  });

  it('keeps only J-space exits under J-space', () => {
    expect(ids('wormhole')).toEqual(['c2']);
  });

  it('offers K-space first, then each band', () => {
    expect(THERA_EXITS).toEqual(['kspace', 'highsec', 'lowsec', 'nullsec', 'wormhole']);
  });
});

describe('countTheraConnectionsByHub', () => {
  const rows = buildTheraConnectionRows(
    [
      connection({ id: 'thera-hs' }),
      connection({ id: 'thera-hs-capital', maxShipSize: 'capital' }),
      connection({ id: 'turnur-hs', hub: 'turnur' }),
      connection({
        id: 'turnur-c2',
        hub: 'turnur',
        exitSystemId: 31000629,
        exitSystemName: 'J120704',
        exitClass: 'c2',
      }),
    ],
    { now: NOW, systems: SYSTEMS, distances: NO_ORIGIN }
  );

  it('counts each hub under the exit and ship size filters, whichever hub is picked', () => {
    expect(
      countTheraConnectionsByHub(rows, { hub: 'thera', shipSize: 'any', exit: 'kspace' })
    ).toEqual({ all: 3, thera: 2, turnur: 1 });
    expect(
      countTheraConnectionsByHub(rows, { hub: 'all', shipSize: 'capital', exit: 'kspace' })
    ).toEqual({ all: 1, thera: 1, turnur: 0 });
    expect(
      countTheraConnectionsByHub(rows, { hub: 'all', shipSize: 'any', exit: 'wormhole' })
    ).toEqual({ all: 1, thera: 0, turnur: 1 });
  });
});

describe('longestLifeFirst', () => {
  it('orders rows by remaining life, longest first, then by exit name', () => {
    const rows = buildTheraConnectionRows(
      [
        connection({ id: '3h', expiresAt: NOW + 3 * HOUR }),
        connection({ id: '12h-b', exitSystemName: 'B', expiresAt: NOW + 12 * HOUR }),
        connection({ id: '12h-a', exitSystemName: 'A', expiresAt: NOW + 12 * HOUR }),
        connection({ id: '1h', expiresAt: NOW + HOUR }),
      ],
      { now: NOW, systems: SYSTEMS, distances: NO_ORIGIN }
    );
    expect(longestLifeFirst(rows).map((row) => row.id)).toEqual(['12h-a', '12h-b', '3h', '1h']);
  });
});
