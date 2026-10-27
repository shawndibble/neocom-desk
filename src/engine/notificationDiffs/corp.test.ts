import { describe, it, expect } from 'vitest';
import {
  diffStructureFuelLow,
  diffCorpIndustryJobReady,
  diffCorpMemberJoined,
  diffCorpMemberLeft,
  diffCorpWalletThreshold,
  type StructureFuelEntrySnapshot,
  type StructureFuelSnapshot,
  type CorpIndustryJobEntrySnapshot,
  type CorpIndustryJobSnapshot,
  type CorpRosterSnapshot,
  type CorpWalletDivisionSnapshot,
  type CorpWalletSnapshot,
} from './index';

const T0 = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;
const DAY = 86_400_000;

function fuelEntry(
  overrides: Partial<StructureFuelEntrySnapshot> & Pick<StructureFuelEntrySnapshot, 'structureId'>
): StructureFuelEntrySnapshot {
  return { name: 'Fortizar', fuelExpiresMs: null, thresholdMs: 7 * DAY, ...overrides };
}

function fuelSnapshot(
  entries: readonly StructureFuelEntrySnapshot[],
  nowMs: number
): StructureFuelSnapshot {
  return { entries, nowMs };
}

describe('diffStructureFuelLow', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + DAY })], T0);
    expect(diffStructureFuelLow(1, undefined, next)).toEqual([]);
  });

  it('fires when remaining fuel newly crosses the threshold', () => {
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 8 * DAY })], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 8 * DAY })],
      T0 + 2 * DAY
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([
      {
        eventId: 'structureFuelLow',
        characterId: 7,
        structureId: 1,
        structureName: 'Fortizar',
        thresholdMs: 7 * DAY,
        fuelExpiresMs: T0 + 8 * DAY,
      },
    ]);
  });

  it('does not fire while remaining fuel is still above the threshold', () => {
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 20 * DAY })], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 20 * DAY })],
      T0 + DAY
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a structure already under threshold as of the previous poll', () => {
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 2 * DAY })], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 2 * DAY })],
      T0 + FIVE_MIN
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([]);
  });

  it('fires for a structure discovered already under threshold (never seen active before)', () => {
    const prev = fuelSnapshot([], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 2 * DAY })],
      T0 + 2000
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([
      {
        eventId: 'structureFuelLow',
        characterId: 7,
        structureId: 1,
        structureName: 'Fortizar',
        thresholdMs: 7 * DAY,
        fuelExpiresMs: T0 + 2 * DAY,
      },
    ]);
  });

  it('does not fire once a structure has already run fully dry (null fuelExpiresMs)', () => {
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 2 * DAY })], T0);
    const next = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: null })], T0 + 3 * DAY);
    expect(diffStructureFuelLow(7, prev, next)).toEqual([]);
  });

  it('re-fires on a fresh refuel cycle that is itself already inside the window', () => {
    // A refuel moves fuel_expires to a new, later instant — a different
    // countdown from the one `prev` observed, so it is judged fresh rather
    // than matched against the old identity and skipped as already seen.
    const prev = fuelSnapshot([fuelEntry({ structureId: 1, fuelExpiresMs: T0 + DAY })], T0);
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 3 * DAY })],
      T0 + 10_000
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([
      {
        eventId: 'structureFuelLow',
        characterId: 7,
        structureId: 1,
        structureName: 'Fortizar',
        thresholdMs: 7 * DAY,
        fuelExpiresMs: T0 + 3 * DAY,
      },
    ]);
  });

  it('lowering the threshold does not re-fire for a structure already inside the wider, previous window', () => {
    // Was inside the 7-day window (and so already reported) before the
    // Character narrowed it to 1 day — narrowing must not manufacture a
    // second fire for a crossing already reported under the wider setting.
    const prev = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 12 * 3_600_000, thresholdMs: 7 * DAY })],
      T0
    );
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 12 * 3_600_000, thresholdMs: DAY })],
      T0 + FIVE_MIN
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([]);
  });

  it('raising the threshold fires on the very next poll, without a reload (AC4)', () => {
    // 5 days remaining was outside the old 1-day window (never reported);
    // once the Character widens it to 7 days, that same 5 days is newly
    // inside — must fire on this poll, not wait for a fresh baseline.
    const prev = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 5 * DAY, thresholdMs: DAY })],
      T0
    );
    const next = fuelSnapshot(
      [fuelEntry({ structureId: 1, fuelExpiresMs: T0 + 5 * DAY, thresholdMs: 7 * DAY })],
      T0 + FIVE_MIN
    );
    expect(diffStructureFuelLow(7, prev, next)).toEqual([
      {
        eventId: 'structureFuelLow',
        characterId: 7,
        structureId: 1,
        structureName: 'Fortizar',
        thresholdMs: 7 * DAY,
        fuelExpiresMs: T0 + 5 * DAY,
      },
    ]);
  });
});

function corpJobEntry(
  overrides: Partial<CorpIndustryJobEntrySnapshot> &
    Pick<CorpIndustryJobEntrySnapshot, 'jobId' | 'endMs'>
): CorpIndustryJobEntrySnapshot {
  return { blueprintTypeId: 1000, productTypeId: 2000, activityId: 1, ...overrides };
}

function corpJobSnapshot(
  entries: readonly CorpIndustryJobEntrySnapshot[],
  nowMs: number
): CorpIndustryJobSnapshot {
  return { entries, nowMs };
}

describe('diffCorpIndustryJobReady', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 - 1000 })], T0);
    expect(diffCorpIndustryJobReady(1, undefined, next)).toEqual([]);
  });

  it('fires when a corp job newly completes', () => {
    const prev = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 + 1000 })], T0);
    const next = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 + 1000 })], T0 + 2000);
    expect(diffCorpIndustryJobReady(7, prev, next)).toEqual([
      {
        eventId: 'corpIndustryJobReady',
        characterId: 7,
        jobId: 1,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
        endMs: T0 + 1000,
      },
    ]);
  });

  it('does not fire for a job not yet finished', () => {
    const prev = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 + 5000 })], T0);
    const next = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 + 5000 })], T0 + 1000);
    expect(diffCorpIndustryJobReady(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a job already finished as of the previous poll', () => {
    const prev = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 - 5000 })], T0);
    const next = corpJobSnapshot([corpJobEntry({ jobId: 1, endMs: T0 - 5000 })], T0 + FIVE_MIN);
    expect(diffCorpIndustryJobReady(7, prev, next)).toEqual([]);
  });
});

function rosterSnapshot(characterIds: readonly number[], nowMs: number): CorpRosterSnapshot {
  return { entries: characterIds.map((characterId) => ({ characterId })), nowMs };
}

describe('diffCorpMemberJoined / diffCorpMemberLeft', () => {
  it('fire nothing on the first-ever poll (no baseline to diff against)', () => {
    const next = rosterSnapshot([1, 2, 3], T0);
    expect(diffCorpMemberJoined(7, undefined, next)).toEqual([]);
    expect(diffCorpMemberLeft(7, undefined, next)).toEqual([]);
  });

  it('fires corpMemberJoined for an id newly in the roster', () => {
    const prev = rosterSnapshot([1, 2], T0);
    const next = rosterSnapshot([1, 2, 3], T0 + FIVE_MIN);
    expect(diffCorpMemberJoined(7, prev, next)).toEqual([
      { eventId: 'corpMemberJoined', characterId: 7, memberCharacterId: 3 },
    ]);
    expect(diffCorpMemberLeft(7, prev, next)).toEqual([]);
  });

  it('fires corpMemberLeft for an id newly gone from the roster', () => {
    const prev = rosterSnapshot([1, 2, 3], T0);
    const next = rosterSnapshot([1, 2], T0 + FIVE_MIN);
    expect(diffCorpMemberLeft(7, prev, next)).toEqual([
      { eventId: 'corpMemberLeft', characterId: 7, memberCharacterId: 3 },
    ]);
    expect(diffCorpMemberJoined(7, prev, next)).toEqual([]);
  });

  it('fires nothing when the roster is unchanged', () => {
    const prev = rosterSnapshot([1, 2], T0);
    const next = rosterSnapshot([1, 2], T0 + FIVE_MIN);
    expect(diffCorpMemberJoined(7, prev, next)).toEqual([]);
    expect(diffCorpMemberLeft(7, prev, next)).toEqual([]);
  });
});

function walletDivision(
  overrides: Partial<CorpWalletDivisionSnapshot> & Pick<CorpWalletDivisionSnapshot, 'division'>
): CorpWalletDivisionSnapshot {
  return {
    balance: 1_000_000_000,
    journal: [],
    balanceFloorIsk: 50_000_000,
    transactionCeilingIsk: 100_000_000,
    ...overrides,
  };
}

function corpWalletSnapshot(
  divisions: readonly CorpWalletDivisionSnapshot[],
  nowMs: number
): CorpWalletSnapshot {
  return { divisions, nowMs };
}

describe('diffCorpWalletThreshold', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = corpWalletSnapshot([walletDivision({ division: 1, balance: 1_000 })], T0);
    expect(diffCorpWalletThreshold(1, undefined, next)).toEqual([]);
  });

  it('fires balanceBelow when a division balance newly drops to or under the floor', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 1, balance: 60_000_000 })], T0);
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000 })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'balanceBelow',
        division: 1,
        balance: 40_000_000,
        thresholdIsk: 50_000_000,
      },
    ]);
  });

  it('does not re-fire balanceBelow for a division already under floor as of the previous poll', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 1, balance: 40_000_000 })], T0);
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 30_000_000 })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });

  it('lowering the floor does not re-fire for a division already under the wider, previous floor', () => {
    const prev = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000, balanceFloorIsk: 50_000_000 })],
      T0
    );
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000, balanceFloorIsk: 20_000_000 })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });

  it('raising the floor fires on the very next poll, without a reload (AC4)', () => {
    // 40M was above the old 20M floor (never reported); once the Character
    // raises the floor to 50M, that same 40M is newly under it.
    const prev = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000, balanceFloorIsk: 20_000_000 })],
      T0
    );
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, balance: 40_000_000, balanceFloorIsk: 50_000_000 })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'balanceBelow',
        division: 1,
        balance: 40_000_000,
        thresholdIsk: 50_000_000,
      },
    ]);
  });

  it('checks balanceBelow across every division, not just the master', () => {
    const prev = corpWalletSnapshot(
      [
        walletDivision({ division: 1, balance: 60_000_000 }),
        walletDivision({ division: 2, balance: 60_000_000 }),
      ],
      T0
    );
    const next = corpWalletSnapshot(
      [
        walletDivision({ division: 1, balance: 60_000_000 }),
        walletDivision({ division: 2, balance: 10_000_000 }),
      ],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'balanceBelow',
        division: 2,
        balance: 10_000_000,
        thresholdIsk: 50_000_000,
      },
    ]);
  });

  it('fires transactionAbove for a new master-division journal entry over the ceiling', () => {
    const prev = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 1, amount: -1_000 }] })],
      T0
    );
    const next = corpWalletSnapshot(
      [
        walletDivision({
          division: 1,
          journal: [
            { id: 2, amount: 250_000_000 },
            { id: 1, amount: -1_000 },
          ],
        }),
      ],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'transactionAbove',
        division: 1,
        amount: 250_000_000,
        thresholdIsk: 100_000_000,
        journalEntryId: 2,
      },
    ]);
  });

  it('does not fire transactionAbove for a new entry under the ceiling', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 1, journal: [] })], T0);
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 2, amount: 1_000 }] })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });

  it('does not re-fire transactionAbove for a journal entry id already seen', () => {
    const prev = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 2, amount: 250_000_000 }] })],
      T0
    );
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 2, amount: 250_000_000 }] })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });

  it('fires transactionAbove for a large negative (outbound) transaction using its absolute value', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 1, journal: [] })], T0);
    const next = corpWalletSnapshot(
      [walletDivision({ division: 1, journal: [{ id: 2, amount: -250_000_000 }] })],
      T0 + FIVE_MIN
    );
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([
      {
        eventId: 'corpWalletThreshold',
        characterId: 7,
        kind: 'transactionAbove',
        division: 1,
        amount: -250_000_000,
        thresholdIsk: 100_000_000,
        journalEntryId: 2,
      },
    ]);
  });

  it('does not check transactionAbove on a division with no journal (non-master)', () => {
    const prev = corpWalletSnapshot([walletDivision({ division: 2, journal: [] })], T0);
    const next = corpWalletSnapshot([walletDivision({ division: 2, journal: [] })], T0 + FIVE_MIN);
    expect(diffCorpWalletThreshold(7, prev, next)).toEqual([]);
  });
});
