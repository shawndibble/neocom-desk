import { describe, expect, it } from 'vitest';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { MemberActivity } from '@/engine/corp/members';
import type { WidgetRange } from '../layout';
import { corpInactive, corpMembers, corpMining } from './corpPeopleModels';
import type { CorpMembersFeed, CorpMiningFeed } from './corpFeeds';
import type { BuildContext, FeedState, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const DAY = 86_400_000;

const ctx = (range: WidgetRange = 30): BuildContext =>
  ({
    t,
    now: NOW,
    range,
    activeCharacterId: 1,
    scopeAll: false,
    notTrainingAlert: false,
  }) as BuildContext;

const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

const member = (id: number, over: Partial<MemberActivity> = {}): MemberActivity => ({
  characterId: id,
  logonMs: null,
  logoffMs: null,
  startMs: null,
  shipTypeId: null,
  locationId: null,
  ...over,
});

const membersFeed = (over: Partial<CorpMembersFeed> = {}): Feeds =>
  ({
    corpMembers: ok<CorpMembersFeed>({
      readable: true,
      needsReauth: false,
      fetchedAt: new Date(NOW),
      fromCache: false,
      members: [],
      diff: { joined: [], left: [] },
      names: new Map(),
      darkAfterDays: 30,
      loadedAt: NOW,
      ...over,
    }),
  }) as Feeds;

describe('corpMembers', () => {
  it('is blank while the feed is missing, and unreadable keeps its own message', () => {
    expect(corpMembers({} as Feeds, ctx()).status.loading).toBe(true);
    const view = corpMembers(membersFeed({ readable: false, needsReauth: true }), ctx());
    expect(view.status.needsPermission).toBe(true);
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('counts members and says who joined and left', () => {
    const view = corpMembers(
      membersFeed({
        members: [member(1), member(2)],
        diff: { joined: [2], left: [9] },
        names: new Map([[2, 'Bea']]),
      }),
      ctx()
    );
    expect(view.number.value).toBe('2');
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.corpMembers.secondary{"joined":1,"left":1}'
    );
    expect(view.table?.rows.map((r) => r.cells[0])).toEqual(['Bea', '#9']);
    expect(view.table?.footer).toBeUndefined();
    expect(view.to).toBe('/corp/members');
  });

  it('prints no secondary for an empty diff and says so for an unknown one', () => {
    const empty = corpMembers(membersFeed({ members: [member(1)] }), ctx());
    expect(empty.number.secondary).toBeUndefined();
    expect(empty.table?.footer).toBe('overview.widgets.corpMembers.noChange');
    const unknown = corpMembers(membersFeed({ members: [member(1)], diff: null }), ctx());
    expect(unknown.number.secondary).toBeUndefined();
    expect(unknown.table?.rows).toEqual([]);
    expect(unknown.table?.footer).toBe('overview.widgets.corpMembers.unknownDiff');
  });

  it('is empty with no members', () => {
    expect(corpMembers(membersFeed(), ctx()).status.isEmpty).toBe(true);
  });

  it('charts joins by month over the last 12, only with join dates in the window', () => {
    const none = corpMembers(
      membersFeed({ members: [member(1), member(2, { startMs: NOW - 800 * DAY })] }),
      ctx()
    );
    expect(none.chart).toBeUndefined();
    const view = corpMembers(
      membersFeed({
        members: [
          member(1, { startMs: NOW - 2 * DAY }),
          member(2, { startMs: NOW - 5 * DAY }),
          member(3, { startMs: Date.parse('2025-11-15T00:00:00Z') }),
          member(4, { startMs: Date.parse('2025-10-15T00:00:00Z') }),
        ],
      }),
      ctx()
    );
    expect(view.chart?.kind).toBe('bars');
    if (view.chart?.kind !== 'bars') return;
    expect(view.chart.values).toHaveLength(12);
    expect(view.chart.values[11]).toBe(2);
    expect(view.chart.values[0]).toBe(1);
    expect(view.chart.values.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('corpInactive', () => {
  it('lists dark members longest-absent first, never-seen counted from their join date', () => {
    const view = corpInactive(
      membersFeed({
        members: [
          member(1, { logoffMs: NOW - 40 * DAY, logonMs: NOW - 45 * DAY }),
          member(2, { logonMs: NOW - 5 * DAY }),
          member(3, { startMs: NOW - 90 * DAY }),
          member(4, { logoffMs: NOW - 31 * DAY, logonMs: NOW - 2 * DAY }),
        ],
        names: new Map([[1, 'Ann']]),
      }),
      ctx()
    );
    expect(view.number.value).toBe('2');
    expect(view.number.tone).toBe('warning');
    expect(view.number.secondary?.text).toBe('overview.widgets.corpInactive.threshold{"days":30}');
    expect(view.table?.rows.map((r) => r.cells)).toEqual([
      ['#3', 'corp.members.never'],
      ['Ann', 'common.age.days{"count":40}'],
    ]);
    expect(view.table?.pageable).toBe(true);
    expect(view.to).toBe('/corp/members?dark=1');
  });

  it('honours the pilot threshold and is empty with nobody dark', () => {
    const members = [member(1, { logonMs: NOW - 10 * DAY })];
    expect(corpInactive(membersFeed({ members, darkAfterDays: 7 }), ctx()).number.value).toBe('1');
    const view = corpInactive(membersFeed({ members }), ctx());
    expect(view.status.isEmpty).toBe(true);
    expect(view.number.tone).toBe('clear');
  });
});

const row = (characterId: number, typeId: number, daysAgo: number, quantity: number): ObservedRow =>
  ({
    structureId: 1,
    characterId,
    recordedCorporationId: 1,
    typeId,
    date: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10),
    quantity,
    cachedAt: '',
  }) as ObservedRow;

const miningFeed = (over: Partial<CorpMiningFeed> = {}): Feeds =>
  ({
    corpMining: ok<CorpMiningFeed>({
      readable: true,
      needsReauth: false,
      fetchedAt: new Date(NOW),
      fromCache: true,
      rows: [],
      refineryCount: 1,
      truncated: false,
      typeNames: new Map([[10, 'Zeolites']]),
      minerNames: new Map([[1, 'Ann']]),
      ...over,
    }),
  }) as Feeds;

describe('corpMining', () => {
  it('aggregates per miner inside the range, with share and top ore', () => {
    const view = corpMining(
      miningFeed({
        rows: [row(1, 10, 1, 300), row(1, 11, 2, 100), row(2, 10, 3, 100), row(3, 10, 20, 9999)],
      }),
      ctx(7)
    );
    expect(view.number.value).toBe('500');
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.corpMining.topMiner{"name":"Ann","share":"overview.widgets.corpMining.percent{\\"value\\":80}"}'
    );
    expect(view.table?.rows[0]?.cells[0]).toBe('Ann');
    expect(view.table?.rows[0]?.cells[3]).toBe('Zeolites');
    expect(view.table?.rows[1]?.cells[0]).toBe('#2');
    expect(view.table?.rows[1]?.cells[3]).toBe('Zeolites');
    const share = view.table?.rows[0]?.cells[2];
    expect(typeof share === 'object' && 'bar' in share ? share.bar : null).toBeCloseTo(0.8);
    expect(view.chart?.kind).toBe('hbars');
    expect(view.table?.footer).toBeUndefined();
  });

  it('is empty with no refineries, and with nothing mined in range', () => {
    const none = corpMining(miningFeed({ refineryCount: 0 }), ctx());
    expect(none.status.isEmpty).toBe(true);
    expect(none.emptyMessage).toBe('overview.widgets.corpMining.noRefineries');
    expect(corpMining(miningFeed({ rows: [row(1, 10, 20, 5)] }), ctx(7)).status.isEmpty).toBe(true);
  });

  it('notes a truncated ledger and a range deeper than the ledger', () => {
    const view = corpMining(miningFeed({ rows: [row(1, 10, 10, 5)], truncated: true }), ctx(90));
    expect(view.table?.footer).toContain('overview.widgets.corpMining.truncated');
    expect(view.table?.footer).toContain(
      'overview.widgets.corpMining.covered{"count":90,"covered":11}'
    );
  });

  it('is unreadable without access', () => {
    const view = corpMining(miningFeed({ readable: false }), ctx());
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });
});
