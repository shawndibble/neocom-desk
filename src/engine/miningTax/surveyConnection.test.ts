import { describe, expect, it } from 'vitest';
import {
  LEDGER_GRACE_MS,
  connectionWindow,
  findOreClash,
  isConnectionLive,
  parseSurveyConnections,
  planSurveyAutoAssign,
  structureFromLocation,
  upsertSurveyConnection,
  type SurveyConnection,
} from './surveyConnection';
import type { MiningLedgerEntry } from './types';

const HOUR = 60 * 60 * 1000;
const NOON = Date.UTC(2026, 9, 21, 12);
const SYSTEM = 30000142;
const OTHER_SYSTEM = 30002187;
const BITUMENS = 45492;
const COBALTITE = 45494;
const ZEOLITES = 45490;

function connection(overrides: Partial<SurveyConnection> = {}): SurveyConnection {
  return {
    surveyId: 'abc123',
    characterId: 1,
    payeeId: 'p1',
    payeeName: 'Moon Corp',
    taxPct: 10,
    systemId: SYSTEM,
    typeIds: [BITUMENS, COBALTITE],
    fromDate: '2026-10-21',
    untilMs: NOON + 2 * HOUR,
    expiresAt: NOON + 7 * 24 * HOUR,
    connectedAt: NOON - HOUR,
    ...overrides,
  };
}

function entry(
  oreLines: MiningLedgerEntry['oreLines'],
  overrides: Partial<MiningLedgerEntry> = {}
) {
  return {
    characterId: 1,
    date: '2026-10-21',
    solarSystemId: SYSTEM,
    oreLines,
    ...overrides,
  };
}

function assignment(
  oreLines: MiningLedgerEntry['oreLines'],
  overrides: Partial<Parameters<typeof planSurveyAutoAssign>[1][number]> = {}
) {
  return {
    id: 'a1',
    characterId: 1,
    date: '2026-10-21',
    solarSystemId: SYSTEM,
    oreLines,
    payeeId: 'p1',
    taxPct: 10,
    status: 'outstanding',
    ...overrides,
  };
}

describe('connectionWindow', () => {
  it('runs from the first scan’s UTC date until the ETA', () => {
    expect(
      connectionWindow(
        {
          firstAt: Date.UTC(2026, 9, 20, 23, 30),
          etaAt: NOON,
          finished: false,
          finishedAt: null,
          lastAt: NOON - HOUR,
          expiresAt: NOON + 24 * HOUR,
        },
        NOON
      )
    ).toEqual({ fromDate: '2026-10-20', untilMs: NOON });
  });

  it('ends when the field was found empty', () => {
    expect(
      connectionWindow(
        {
          firstAt: NOON - 3 * HOUR,
          etaAt: null,
          finished: true,
          finishedAt: NOON,
          lastAt: NOON,
          expiresAt: NOON + 24 * HOUR,
        },
        NOON
      ).untilMs
    ).toBe(NOON);
  });

  it('runs 12 hours from connecting while there is no ETA yet (one scan, no pace)', () => {
    expect(
      connectionWindow(
        {
          firstAt: NOON,
          etaAt: null,
          finished: false,
          finishedAt: null,
          lastAt: NOON,
          expiresAt: NOON + 48 * HOUR,
        },
        NOON + HOUR
      ).untilMs
    ).toBe(NOON + 13 * HOUR);
  });

  it('never runs a no-ETA window past the survey’s expiry', () => {
    expect(
      connectionWindow(
        {
          firstAt: NOON,
          etaAt: null,
          finished: false,
          finishedAt: null,
          lastAt: NOON,
          expiresAt: NOON + 6 * HOUR,
        },
        NOON
      ).untilMs
    ).toBe(NOON + 6 * HOUR);
  });

  it('never runs past the survey’s expiry', () => {
    expect(
      connectionWindow(
        {
          firstAt: NOON,
          etaAt: NOON + 48 * HOUR,
          finished: false,
          finishedAt: null,
          lastAt: NOON,
          expiresAt: NOON + 24 * HOUR,
        },
        NOON
      ).untilMs
    ).toBe(NOON + 24 * HOUR);
  });
});

describe('isConnectionLive', () => {
  it('stays live a grace period past the ETA, for the ledger’s lag', () => {
    const c = connection({ untilMs: NOON });
    expect(isConnectionLive(c, NOON + LEDGER_GRACE_MS)).toBe(true);
    expect(isConnectionLive(c, NOON + LEDGER_GRACE_MS + 1)).toBe(false);
  });
});

describe('upsertSurveyConnection', () => {
  it('replaces the same survey for the same character and drops ones no longer live', () => {
    const stale = connection({ surveyId: 'old', untilMs: NOON - 5 * HOUR });
    const other = connection({ surveyId: 'other' });
    const first = connection({ taxPct: 5 });
    const next = connection({ taxPct: 10 });
    expect(upsertSurveyConnection([stale, other, first], next, NOON)).toEqual([other, next]);
  });
});

describe('parseSurveyConnections', () => {
  it('keeps well-formed connections and drops the rest', () => {
    const good = connection();
    expect(parseSurveyConnections([good, { surveyId: 'x' }, null, 'junk'])).toEqual([good]);
    expect(parseSurveyConnections('nope')).toBeNull();
  });
});

describe('structureFromLocation', () => {
  it("takes the structure after the system in a station's name", () => {
    expect(structureFromLocation("Ainsan - Mav's Watering Hole")).toBe("Mav's Watering Hole");
  });

  it('keeps a structure name that has its own dash', () => {
    expect(structureFromLocation('Ainsan - Moon - Mining Outpost')).toBe('Moon - Mining Outpost');
  });

  it('has none for a bare system or a blank name', () => {
    expect(structureFromLocation('Ainsan')).toBeUndefined();
    expect(structureFromLocation('  ')).toBeUndefined();
    expect(structureFromLocation(undefined)).toBeUndefined();
    expect(structureFromLocation('Ainsan - ')).toBeUndefined();
  });
});

describe('planSurveyAutoAssign', () => {
  it("hands the connection's structure on as each slice's label", () => {
    const slices = planSurveyAutoAssign(
      [entry([{ typeId: BITUMENS, quantity: 100 }])],
      [],
      [connection({ structureLabel: "Mav's Watering Hole" })],
      NOON
    );
    expect(slices.map((s) => s.label)).toEqual(["Mav's Watering Hole"]);
  });

  it('assigns already-mined, unassigned ore of the survey’s ore types', () => {
    const e = entry([
      { typeId: BITUMENS, quantity: 1000 },
      { typeId: COBALTITE, quantity: 500 },
    ]);
    expect(planSurveyAutoAssign([e], [], [connection()], NOON)).toEqual([
      {
        connection: connection(),
        characterId: 1,
        date: '2026-10-21',
        solarSystemId: SYSTEM,
        oreLines: [
          { typeId: BITUMENS, quantity: 1000 },
          { typeId: COBALTITE, quantity: 500 },
        ],
        entryOreLines: e.oreLines,
      },
    ]);
  });

  it('assigns only the ore no Assignment holds yet', () => {
    const e = entry([{ typeId: BITUMENS, quantity: 1500 }]);
    const held = assignment([{ typeId: BITUMENS, quantity: 1000 }], {
      payeeId: 'someone-else',
    });
    expect(planSurveyAutoAssign([e], [held], [connection()], NOON)[0]?.oreLines).toEqual([
      { typeId: BITUMENS, quantity: 500 },
    ]);
  });

  it('leaves growth to an unpaid Assignment already billing this Payee at this rate', () => {
    const e = entry([{ typeId: BITUMENS, quantity: 1500 }]);
    const held = assignment([{ typeId: BITUMENS, quantity: 1000 }]);
    expect(planSurveyAutoAssign([e], [held], [connection()], NOON)).toEqual([]);
  });

  it('still assigns new ore when the one billing this Payee is paid', () => {
    const e = entry([{ typeId: BITUMENS, quantity: 1500 }]);
    const held = assignment([{ typeId: BITUMENS, quantity: 1000 }], { status: 'paid' });
    expect(planSurveyAutoAssign([e], [held], [connection()], NOON)).toHaveLength(1);
  });

  it('respects an entry the pilot dismissed', () => {
    const e = entry([{ typeId: BITUMENS, quantity: 1500 }]);
    const held = assignment([{ typeId: BITUMENS, quantity: 1000 }], {
      status: 'dismissed',
      payeeId: undefined,
      taxPct: 0,
    });
    expect(planSurveyAutoAssign([e], [held], [connection()], NOON)).toEqual([]);
  });

  it('skips other systems, characters, days before the survey and days after it', () => {
    const lines = [{ typeId: BITUMENS, quantity: 1000 }];
    const entries = [
      entry(lines, { solarSystemId: OTHER_SYSTEM }),
      entry(lines, { characterId: 2 }),
      entry(lines, { date: '2026-10-20' }),
      entry(lines, { date: '2026-10-22' }),
    ];
    expect(planSurveyAutoAssign(entries, [], [connection()], NOON)).toEqual([]);
  });

  it('does nothing once the connection is past its ETA and grace', () => {
    const e = entry([{ typeId: BITUMENS, quantity: 1000 }]);
    const c = connection({ untilMs: NOON - LEDGER_GRACE_MS - 1 });
    expect(planSurveyAutoAssign([e], [], [c], NOON)).toEqual([]);
  });

  it('does nothing without a system to match', () => {
    const e = entry([{ typeId: BITUMENS, quantity: 1000 }]);
    expect(planSurveyAutoAssign([e], [], [connection({ systemId: null })], NOON)).toEqual([]);
  });

  it('never guesses: another moon’s ore no connection covers leaves the entry alone', () => {
    const e = entry([
      { typeId: BITUMENS, quantity: 1000 },
      { typeId: ZEOLITES, quantity: 800 },
    ]);
    expect(planSurveyAutoAssign([e], [], [connection()], NOON)).toEqual([]);
  });

  it('splits one entry between two connected moons with different ores', () => {
    const e = entry([
      { typeId: BITUMENS, quantity: 1000 },
      { typeId: ZEOLITES, quantity: 800 },
    ]);
    const moonB = connection({ surveyId: 'b', payeeId: 'p2', typeIds: [ZEOLITES] });
    const plan = planSurveyAutoAssign([e], [], [connection(), moonB], NOON);
    expect(plan.map((s) => [s.connection.payeeId, s.oreLines])).toEqual([
      ['p1', [{ typeId: BITUMENS, quantity: 1000 }]],
      ['p2', [{ typeId: ZEOLITES, quantity: 800 }]],
    ]);
  });

  it('gives shared ore to the moon still being mined over one in its grace period', () => {
    const e = entry([{ typeId: BITUMENS, quantity: 1000 }]);
    const done = connection({ untilMs: NOON - HOUR / 2 });
    const mining = connection({ surveyId: 'b', payeeId: 'p2', untilMs: NOON + HOUR });
    expect(planSurveyAutoAssign([e], [], [done, mining], NOON)[0]?.connection.payeeId).toBe('p2');
  });

  it('never guesses between two moons both being mined with the same ore', () => {
    const e = entry([{ typeId: BITUMENS, quantity: 1000 }]);
    const b = connection({ surveyId: 'b', payeeId: 'p2' });
    expect(planSurveyAutoAssign([e], [], [connection(), b], NOON)).toEqual([]);
  });
});

describe('findOreClash', () => {
  const mining = { untilMs: NOON + HOUR };
  const a = connection({ surveyId: 'a', ...mining });

  it('finds another Payee mining the same ore in the same system', () => {
    const b = connection({ surveyId: 'b', payeeId: 'p2', ...mining });
    expect(findOreClash(a, [a, b], NOON)).toBe(b);
  });

  it('finds the same Payee on two surveys, which the engine also leaves unassigned', () => {
    const b = connection({ surveyId: 'b', ...mining });
    expect(findOreClash(a, [a, b], NOON)).toBe(b);
  });

  it('finds two connections both in the grace window', () => {
    const late = NOON + HOUR / 2;
    const x = connection({ surveyId: 'x', payeeId: 'p1', untilMs: NOON + 1 });
    const y = connection({ surveyId: 'y', payeeId: 'p2', untilMs: NOON + 1 });
    expect(findOreClash(x, [x, y], late)).toBe(y);
  });

  it('is clear when only one is still being mined', () => {
    const done = connection({ surveyId: 'b', payeeId: 'p2', untilMs: NOON - 1 });
    expect(findOreClash(a, [a, done], NOON)).toBeUndefined();
  });

  it('is clear for another system, ore, Character, or an expired connection', () => {
    const others = [
      connection({ surveyId: 'b', payeeId: 'p2', systemId: OTHER_SYSTEM, ...mining }),
      connection({ surveyId: 'c', payeeId: 'p2', typeIds: [ZEOLITES], ...mining }),
      connection({ surveyId: 'd', payeeId: 'p2', characterId: 2, ...mining }),
      connection({ surveyId: 'e', payeeId: 'p2', untilMs: NOON - 2 * HOUR }),
    ];
    expect(findOreClash(a, [a, ...others], NOON)).toBeUndefined();
  });

  it('is clear with no system, since such a connection claims nothing', () => {
    const x = connection({ surveyId: 'x', systemId: null, ...mining });
    const y = connection({ surveyId: 'y', payeeId: 'p2', systemId: null, ...mining });
    expect(findOreClash(x, [x, y], NOON)).toBeUndefined();
  });
});
