import { DAY_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import type { VettingFlag, VettingParty, VettingRawRow } from '@/engine/vetting';
import {
  CYNO_SKILL_ID,
  NO_RAW_FILTERS,
  filterRawItems,
  flagDataTarget,
  prepareRawItems,
  rawKindOptions,
  standingBucket,
  tenureSeconds,
  validTime,
  type RawContext,
} from './rawRowsView';

const parties = new Map<number, VettingParty>([
  [10, { id: 10, name: 'Corvin Hale', category: 'character', corporationId: 20 }],
  [20, { id: 20, name: 'Black Kite Syndicate', category: 'corporation' }],
  [30, { id: 30, name: 'Orrin Dask', category: 'character' }],
]);

const iskFlag: VettingFlag = {
  check: 'watchlistIsk',
  severity: 'critical',
  characterIds: [1],
  facts: {},
  evidence: [
    {
      characterId: 1,
      at: '2026-11-10T10:00:00.000Z',
      partyId: 10,
      what: 'player_donation',
      amount: 5,
    },
  ],
  evidenceTotal: 1,
};
const cynoFlag: VettingFlag = {
  check: 'cynoNoCapital',
  severity: 'warning',
  characterIds: [2],
  facts: { level: 5 },
  evidence: [],
  evidenceTotal: 0,
};

const ctx = (over: Partial<RawContext> = {}): RawContext => ({
  parties,
  flags: [iskFlag, cynoFlag],
  skills: new Map([
    [CYNO_SKILL_ID, { name: 'Cynosural Field Theory', group: 'Navigation' }],
    [3300, { name: 'Gunnery', group: 'Gunnery' }],
  ]),
  whatLabel: (what) => what,
  ...over,
});

const wallet = (over: Partial<VettingRawRow> = {}): VettingRawRow => ({
  characterId: 1,
  at: '2026-11-10T10:00:00.000Z',
  what: 'player_donation',
  partyId: 10,
  amount: 5,
  ...over,
});

describe('prepareRawItems', () => {
  it('marks a wallet row that matches a flag evidence entry, and only that one', () => {
    const items = prepareRawItems(
      'wallet',
      [wallet(), wallet({ amount: 6 }), wallet({ characterId: 3 })],
      ctx()
    );
    expect(items.map((item) => item.flag?.check)).toEqual(['watchlistIsk', undefined, undefined]);
  });

  it('marks the Cyno skill row for the flag characters only', () => {
    const rows: VettingRawRow[] = [
      { characterId: 2, at: null, what: '', skillId: CYNO_SKILL_ID, level: 5 },
      { characterId: 1, at: null, what: '', skillId: CYNO_SKILL_ID, level: 5 },
      { characterId: 2, at: null, what: '', skillId: 3300, level: 5 },
    ];
    const items = prepareRawItems('skills', rows, ctx());
    expect(items.map((item) => item.flag?.check)).toEqual(['cynoNoCapital', undefined, undefined]);
  });

  it('gives every item a unique key, even for identical rows', () => {
    const items = prepareRawItems('wallet', [wallet(), wallet()], ctx());
    expect(new Set(items.map((item) => item.key)).size).toBe(2);
  });
});

describe('filterRawItems', () => {
  const rows = [
    wallet(),
    wallet({ at: '2026-11-01T00:00:00.000Z', what: 'bounty_prizes', partyId: 30, amount: 9 }),
    wallet({ at: '2026-10-01T00:00:00.000Z', partyId: 20 }),
  ];
  const items = prepareRawItems('wallet', rows, ctx());

  it('searches names and the type', () => {
    expect(filterRawItems(items, { ...NO_RAW_FILTERS, query: 'orrin' })).toHaveLength(1);
    expect(filterRawItems(items, { ...NO_RAW_FILTERS, query: 'bounty' })).toHaveLength(1);
  });

  it('filters by kind, date range (inclusive) and flagged', () => {
    expect(filterRawItems(items, { ...NO_RAW_FILTERS, kind: 'bounty_prizes' })).toHaveLength(1);
    expect(
      filterRawItems(items, { ...NO_RAW_FILTERS, from: '2026-11-01', to: '2026-11-10' })
    ).toHaveLength(2);
    expect(filterRawItems(items, { ...NO_RAW_FILTERS, flagged: true })).toHaveLength(1);
  });

  it('drops undated rows once a date range is set, and keeps them otherwise', () => {
    const skill = prepareRawItems(
      'skills',
      [{ characterId: 2, at: null, what: '', skillId: 3300, level: 1 }],
      ctx()
    );
    expect(filterRawItems(skill, { ...NO_RAW_FILTERS, from: '2026-11-01' })).toHaveLength(0);
    expect(filterRawItems(skill, { ...NO_RAW_FILTERS, to: '2026-11-01' })).toHaveLength(0);
    expect(filterRawItems(skill, NO_RAW_FILTERS)).toHaveLength(1);
  });
});

describe('kinds', () => {
  it('buckets standings', () => {
    expect([standingBucket(-5), standingBucket(0), standingBucket(2.5)]).toEqual([
      'hostile',
      'neutral',
      'friendly',
    ]);
  });

  it('lists the distinct kinds of a source, sorted', () => {
    const items = prepareRawItems(
      'wallet',
      [wallet({ what: 'b' }), wallet({ what: 'a' }), wallet({ what: 'b' })],
      ctx()
    );
    expect(rawKindOptions(items)).toEqual(['a', 'b']);
  });

  it('uses the skill group as the skills kind', () => {
    const items = prepareRawItems(
      'skills',
      [{ characterId: 2, at: null, what: '', skillId: 3300, level: 1 }],
      ctx()
    );
    expect(rawKindOptions(items)).toEqual(['Gunnery']);
  });
});

describe('tenureSeconds', () => {
  const readAt = Date.parse('2026-11-14T00:00:00Z');
  it('runs to the read when the character is still there', () => {
    const row: VettingRawRow = {
      characterId: 1,
      at: null,
      what: '',
      joined: '2026-11-04T00:00:00Z',
      left: null,
    };
    expect(tenureSeconds(row, readAt)).toBe((10 * DAY_MS) / 1000);
  });
  it('runs to the day left otherwise', () => {
    const row: VettingRawRow = {
      characterId: 1,
      at: null,
      what: '',
      joined: '2026-11-04T00:00:00Z',
      left: '2026-11-06T00:00:00Z',
    };
    expect(tenureSeconds(row, readAt)).toBe((2 * DAY_MS) / 1000);
  });
});

describe('flagDataTarget', () => {
  it('points an ISK flag at its wallet rows, with the count', () => {
    expect(flagDataTarget(iskFlag)).toEqual({ source: 'wallet', count: 1 });
  });
  it('points an undeclared-character flag at the source its rows are in', () => {
    const flag: VettingFlag = {
      ...iskFlag,
      check: 'undeclaredCharacter',
      evidence: [{ ...iskFlag.evidence[0]!, what: 'courier' }],
    };
    expect(flagDataTarget(flag)?.source).toBe('contract');
  });
  it('points the Cyno flag at Skills with no count', () => {
    expect(flagDataTarget(cynoFlag)).toEqual({ source: 'skills', count: null });
  });
  it('has no target for a flag whose rows are not in a source', () => {
    expect(flagDataTarget({ ...cynoFlag, check: 'thinCharacter' })).toBeNull();
  });
});

describe('malformed dates', () => {
  it('reads as no time, and a tenure of zero', () => {
    expect(validTime('not a date')).toBeNull();
    expect(validTime(null)).toBeNull();
    expect(validTime('2026-11-04T00:00:00Z')).toBe(Date.parse('2026-11-04T00:00:00Z'));
    const row: VettingRawRow = { characterId: 1, at: null, what: '', joined: 'x', left: null };
    expect(tenureSeconds(row, Date.now())).toBe(0);
  });
});
