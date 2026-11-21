import { describe, expect, it } from 'vitest';
import { DEFAULT_GRACE_HOURS } from './billable';
import {
  latestRecordedCorp,
  parseBookSettings,
  parseRate,
  parseTaxContact,
  RATE_SCOPES,
} from './bookDocs';
import { DEFAULT_OVERDUE_DAYS } from './overdue';
import { DEFAULT_NOTICE_RULES } from './notices';
import { DAY_SETTLE_TOLERANCE_PCT } from './minerRunningAccount';

describe('parseRate', () => {
  it.each([
    { scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' },
    { scope: 'guest', pct: 12, effectiveFrom: '2026-10-01' },
    { scope: 'feeder', feederId: 7, pct: 6, effectiveFrom: '2026-10-01' },
    { scope: 'feeder-member', feederId: 7, pct: 4, effectiveFrom: '2026-10-01' },
    { scope: 'miner', minerId: 'solo:9', pct: 3, effectiveFrom: '2026-10-01' },
    { scope: 'moon', moonId: 40000001, pct: 8, effectiveFrom: '2026-10-01' },
    { scope: 'structure', structureId: 1020, pct: 9, effectiveFrom: '2026-10-01' },
    { scope: 'record', recordKey: '9:1020:2026-10-02', pct: 0 },
  ])('keeps a $scope rate', (rate) => {
    expect(parseRate(rate)).toEqual(rate);
  });

  it.each([
    ['junk', 'junk'],
    ['null', null],
    ['an unknown scope', { scope: 'nonsense', pct: 5, effectiveFrom: '2026-10-01' }],
    ['no pct', { scope: 'corp', effectiveFrom: '2026-10-01' }],
    ['a NaN pct', { scope: 'corp', pct: Number.NaN, effectiveFrom: '2026-10-01' }],
    ['a dated rate with no date', { scope: 'corp', pct: 5 }],
    ['a feeder rate with no feeder', { scope: 'feeder', pct: 5, effectiveFrom: '2026-10-01' }],
    ['a record rate with no record', { scope: 'record', pct: 5 }],
  ])('drops %s', (_, rate) => {
    expect(parseRate(rate)).toBeNull();
  });

  it('knows every scope the engine resolves, so a new one is never silently dropped', () => {
    expect([...RATE_SCOPES].sort()).toEqual(
      ['corp', 'guest', 'feeder', 'feeder-member', 'miner', 'moon', 'structure', 'record'].sort()
    );
  });
});

describe('parseBookSettings', () => {
  const book = {
    active: true,
    startDate: '2026-10-01',
    graceHours: 12,
    hubId: 'amarr',
    oreForm: 'raw',
    divisions: [2, 'x', 3],
    rates: [
      { scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' },
      { scope: 'nonsense', pct: 5 },
      'junk',
    ],
    overdueDays: 21,
    lastSync: { at: Date.parse('2026-10-18T12:00:00Z'), byName: 'Officer' },
  };

  it('reads the stored fields, keeping only valid rates and divisions', () => {
    expect(parseBookSettings(book)).toMatchObject({
      active: true,
      startDate: '2026-10-01',
      graceHours: 12,
      hubId: 'amarr',
      oreForm: 'raw',
      divisions: [2, 3],
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }],
      overdueDays: 21,
      lastSync: book.lastSync,
    });
  });

  it("reads the corp's wallet division names a Director stored (#6161), skipping garbage", () => {
    expect(
      parseBookSettings({ ...book, divisionNames: { '2': 'MOON TAXES', '9': 'x', '3': 5 } })
        .divisionNames
    ).toEqual({ 2: 'MOON TAXES' });
    expect(parseBookSettings({ ...book, divisionNames: 'junk' }).divisionNames).toEqual({});
  });

  it("fills every absent or malformed field from the engine's defaults", () => {
    expect(parseBookSettings({ graceHours: Number.POSITIVE_INFINITY, overdueDays: 'x' })).toEqual({
      active: false,
      startDate: '',
      divisions: [1],
      divisionNames: {},
      lastSync: null,
      structureExpiryHours: {},
      hubId: 'jita',
      oreForm: 'compressed',
      graceHours: DEFAULT_GRACE_HOURS,
      overdueDays: DEFAULT_OVERDUE_DAYS,
      noticeRules: DEFAULT_NOTICE_RULES,
      dayTolerancePct: DAY_SETTLE_TOLERANCE_PCT,
      chunkM3PerHour: null,
      rates: [],
      dismissApprovalAboveIsk: null,
      ownerCharacterId: null,
      createdBy: null,
    });
  });

  it('reads the running account rules', () => {
    const s = parseBookSettings({
      noticeRules: { after: { kind: 'dayOfMonth', day: 5 }, minimum: 20_000_000, cooldownDays: 7 },
      dayTolerancePct: 1,
    });
    expect(s.noticeRules.after).toEqual({ kind: 'dayOfMonth', day: 5 });
    expect(s.dayTolerancePct).toBe(1);
  });

  it('keeps the officer-only fields and the setup window', () => {
    const seeFrom = Date.parse('2026-10-21T12:00:00Z');
    expect(
      parseBookSettings({
        structureExpiryHours: { '1020': 48, '1021': 'x' },
        chunkM3PerHour: 30_000,
        dismissApprovalAboveIsk: 50_000_000,
        ownerCharacterId: 9,
        createdBy: 8,
        membersSeeFrom: seeFrom,
      })
    ).toMatchObject({
      structureExpiryHours: { '1020': 48 },
      chunkM3PerHour: 30_000,
      dismissApprovalAboveIsk: 50_000_000,
      ownerCharacterId: 9,
      createdBy: 8,
      membersSeeFrom: seeFrom,
    });
  });
});

describe('latestRecordedCorp', () => {
  const MEMBER_CORP = 98000001;
  const OTHER_CORP = 98000002;
  const row = (over: Partial<Parameters<typeof latestRecordedCorp>[0][number]> = {}) => ({
    characterId: 9,
    date: '2026-10-17',
    recordedCorporationId: MEMBER_CORP,
    structureId: 1020,
    cachedAt: '2026-10-17T10:00:00Z',
    ...over,
  });

  it.each([
    {
      name: 'the newest day wins over a fresher read of an older day',
      rows: [
        row({
          date: '2026-10-16',
          recordedCorporationId: OTHER_CORP,
          cachedAt: '2026-10-18T00:00:00Z',
        }),
        row(),
      ],
      corp: MEMBER_CORP,
    },
    {
      name: 'mid-day corp change at two refineries: the fresher read wins, in either order',
      rows: [
        row({ structureId: 2000, cachedAt: '2026-10-17T09:00:00Z' }),
        row({
          structureId: 1020,
          recordedCorporationId: OTHER_CORP,
          cachedAt: '2026-10-17T15:00:00Z',
        }),
      ],
      corp: OTHER_CORP,
    },
    {
      name: 'mid-day corp change at two refineries, rows listed the other way round',
      rows: [
        row({
          structureId: 1020,
          recordedCorporationId: OTHER_CORP,
          cachedAt: '2026-10-17T15:00:00Z',
        }),
        row({ structureId: 2000, cachedAt: '2026-10-17T09:00:00Z' }),
      ],
      corp: OTHER_CORP,
    },
    {
      name: 'one read reporting both corps: the higher refinery id, in either order',
      rows: [
        row({ structureId: 2000 }),
        row({ structureId: 1020, recordedCorporationId: OTHER_CORP }),
      ],
      corp: MEMBER_CORP,
    },
    {
      name: 'one read, one refinery, both corps: the higher corporation id, in either order',
      rows: [row({ recordedCorporationId: OTHER_CORP }), row()],
      corp: OTHER_CORP,
    },
    {
      name: 'the same, listed the other way round',
      rows: [row(), row({ recordedCorporationId: OTHER_CORP })],
      corp: OTHER_CORP,
    },
    {
      name: 'a row with no read time loses to one with',
      rows: [
        row({ cachedAt: undefined, recordedCorporationId: OTHER_CORP, structureId: 9999 }),
        row(),
      ],
      corp: MEMBER_CORP,
    },
  ])('$name', ({ rows, corp }) => {
    expect(latestRecordedCorp(rows).get(9)).toEqual({ date: '2026-10-17', corp });
  });

  it('answers per character, and nothing for one with no rows', () => {
    const latest = latestRecordedCorp([
      row(),
      row({ characterId: 10, recordedCorporationId: OTHER_CORP }),
    ]);
    expect(latest.get(10)?.corp).toBe(OTHER_CORP);
    expect(latest.get(11)).toBeUndefined();
  });
});

describe('taxContact', () => {
  const base = { active: true, startDate: '2026-10-01' };

  it('reads a mailing list and a set of characters, deduping ids', () => {
    expect(parseTaxContact({ kind: 'mailingList', id: 7, name: 'Desk' })).toEqual({
      kind: 'mailingList',
      id: 7,
      name: 'Desk',
    });
    expect(parseTaxContact({ kind: 'characters', ids: [3, 4, 3] })).toEqual({
      kind: 'characters',
      ids: [3, 4],
    });
  });

  it.each([
    undefined,
    null,
    'junk',
    { kind: 'mailingList', id: 0, name: 'x' },
    { kind: 'mailingList', id: 7, name: 5 },
    { kind: 'mailingList', id: 1.5, name: 'x' },
    { kind: 'characters', ids: [] },
    { kind: 'characters', ids: [1, 2, 3, 4, 5, 6] },
    { kind: 'characters', ids: [1, -2] },
    { kind: 'characters', ids: 'x' },
    { kind: 'other' },
  ])('treats %j as absent', (bad) => {
    expect(parseTaxContact(bad)).toBeUndefined();
    expect(parseBookSettings({ ...base, taxContact: bad })).not.toHaveProperty('taxContact');
  });

  it('is on the parsed settings when valid', () => {
    expect(
      parseBookSettings({ ...base, taxContact: { kind: 'characters', ids: [9] } }).taxContact
    ).toEqual({ kind: 'characters', ids: [9] });
  });
});
