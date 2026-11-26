import { describe, expect, it } from 'vitest';
import type { CorpMembersFeed, CorpRoleAuditFeed, CorpSrpFeed } from './corpFeeds';
import { mergeMembersReads, mergeRoleAuditReads, mergeSrpReads } from './corpAllMerges';
import { narrowFeedsToCorporation } from './corpNarrow';
import type { Feeds } from './types';

const A = 1;
const B = 2;
const base = { readable: true, needsReauth: false, fetchedAt: null, fromCache: false };

describe('mergeSrpReads', () => {
  const read = (
    corporationId: number,
    killmailIds: number[],
    enabled = true
  ): CorpSrpFeed & { corporationId: number } => ({
    ...base,
    corporationId,
    enabled,
    canSetUp: false,
    claims: killmailIds.map((killmailId) => ({ killmailId }) as never),
    typeNames: new Map([[killmailId(corporationId), `hull${corporationId}`]]),
    systemNames: new Map(),
  });
  const killmailId = (corp: number) => corp * 100;

  it('lists every corporation’s claims under its corporation, on if any corporation has SRP on', () => {
    const merged = mergeSrpReads([read(A, [10, 11]), read(B, [20], false)]);
    expect(merged.body.claims).toHaveLength(3);
    expect(merged.body.enabled).toBe(true);
    expect([...merged.corporationOf]).toEqual([
      ['10', A],
      ['11', A],
      ['20', B],
    ]);
    expect(merged.body.typeNames.size).toBe(2);
  });
});

describe('mergeMembersReads', () => {
  const read = (
    corporationId: number,
    members: number[],
    diff: { joined: number[]; left: number[] } | null
  ): CorpMembersFeed & { corporationId: number } => ({
    ...base,
    corporationId,
    members: members.map((characterId) => ({ characterId }) as never),
    diff,
    names: new Map(members.map((id) => [id, `P${id}`])),
    darkAfterDays: 30,
    loadedAt: corporationId * 1000,
  });

  it('files each member and each join or leave under its corporation', () => {
    const merged = mergeMembersReads([
      read(A, [1, 2], { joined: [2], left: [] }),
      read(B, [3], { joined: [], left: [9] }),
    ]);
    expect(merged.body.members.map((m) => m.characterId)).toEqual([1, 2, 3]);
    expect(merged.body.diff).toEqual({ joined: [2], left: [9] });
    expect(merged.corporationOf.get('joined:2')).toBe(A);
    expect(merged.corporationOf.get('left:9')).toBe(B);
    expect(merged.body.loadedAt).toBe(2000);
  });

  it('is unknown only when no corporation could say what changed', () => {
    expect(mergeMembersReads([read(A, [1], null), read(B, [2], null)]).body.diff).toBeNull();
    expect(
      mergeMembersReads([read(A, [1], null), read(B, [2], { joined: [2], left: [] })]).body.diff
    ).toEqual({ joined: [2], left: [] });
  });

  it('narrows to one corporation, keeping only its members and its changes', () => {
    const merged = mergeMembersReads([
      read(A, [1, 2], { joined: [2], left: [] }),
      read(B, [3], { joined: [], left: [9] }),
    ]);
    const feeds = {
      corpMembersAll: {
        data: {
          ...base,
          ...merged.body,
          corporationOf: merged.corporationOf,
          corporations: new Map([
            [A, {}],
            [B, {}],
          ]),
        },
        error: false,
        loading: false,
      },
    } as unknown as Feeds;
    const narrowed = narrowFeedsToCorporation(feeds, B).corpMembersAll!.data!;
    expect(narrowed.members.map((m) => m.characterId)).toEqual([3]);
    expect(narrowed.diff).toEqual({ joined: [], left: [9] });
  });
});

describe('mergeRoleAuditReads', () => {
  const change = (characterId: number, changedAtMs: number) =>
    ({ characterId, changedAtMs }) as never;
  const read = (
    corporationId: number,
    holders: number[],
    changes: ReturnType<typeof change>[] | null
  ): CorpRoleAuditFeed & { corporationId: number } => ({
    ...base,
    corporationId,
    audit: {
      holders: holders.map((characterId) => ({ characterId, roles: ['Director'] }) as never),
      changes,
      titlesKnown: true,
      names: new Map(),
      ceoId: 5,
      fetchedAt: new Date(corporationId),
      fromCache: false,
    },
  });

  it('merges holders and interleaves role changes newest first', () => {
    const merged = mergeRoleAuditReads([
      read(A, [1], [change(1, 100), change(1, 10)]),
      read(B, [2], [change(2, 50)]),
    ]);
    expect(merged.body.audit.holders.map((h) => h.characterId)).toEqual([1, 2]);
    expect(merged.body.audit.changes!.map((c) => c.changedAtMs)).toEqual([100, 50, 10]);
    expect(merged.corporationOf.get('2')).toBe(B);
    expect(merged.body.audit.fetchedAt).toEqual(new Date(A));
  });

  it('has no change history only when no corporation read one', () => {
    expect(
      mergeRoleAuditReads([read(A, [1], null), read(B, [2], null)]).body.audit.changes
    ).toBeNull();
    expect(
      mergeRoleAuditReads([read(A, [1], null), read(B, [2], [change(2, 5)])]).body.audit.changes
    ).toHaveLength(1);
  });
});

describe('narrowing the merged Roles audit and SRP reads to one corporation', () => {
  const change = (characterId: number, changedAtMs: number) =>
    ({ characterId, changedAtMs }) as never;
  const audit = (
    corporationId: number,
    holders: number[],
    changes: ReturnType<typeof change>[] | null
  ) => ({
    ...base,
    corporationId,
    audit: {
      holders: holders.map((characterId) => ({ characterId, roles: ['Director'] }) as never),
      changes,
      titlesKnown: true,
      names: new Map(),
      ceoId: null,
      fetchedAt: new Date(1),
      fromCache: false,
    },
  });
  const state = (data: unknown) => ({ data, error: false, loading: false });

  it('keeps a corporation’s holders and every change in it, even by someone who holds no role now', () => {
    const merged = mergeRoleAuditReads([
      audit(A, [1], [change(1, 10), change(7, 5)]),
      audit(B, [2], [change(2, 50)]),
    ]);
    const feeds = {
      corpRoleAuditAll: state({
        ...base,
        ...merged.body,
        corporationOf: merged.corporationOf,
        corporations: new Map([
          [A, {}],
          [B, {}],
        ]),
        partlyFailed: false,
      }),
    } as unknown as Feeds;
    const narrowed = narrowFeedsToCorporation(feeds, A).corpRoleAuditAll!.data!;
    expect(narrowed.audit!.holders.map((h) => h.characterId)).toEqual([1]);
    expect(narrowed.audit!.changes!.map((c) => c.characterId).sort()).toEqual([1, 7]);
  });

  it('narrows an unreadable audit without throwing', () => {
    const feeds = {
      corpRoleAuditAll: state({
        ...base,
        readable: false,
        audit: null,
        corporations: new Map(),
        corporationOf: new Map(),
        partlyFailed: true,
      }),
    } as unknown as Feeds;
    expect(narrowFeedsToCorporation(feeds, A).corpRoleAuditAll!.data!.audit).toBeNull();
  });

  it('gives a corporation with SRP off its own off state, not another corporation’s', () => {
    const srp = (corporationId: number, enabled: boolean, canSetUp: boolean) => ({
      ...base,
      corporationId,
      enabled,
      canSetUp,
      claims: enabled ? [{ killmailId: corporationId } as never] : [],
      typeNames: new Map(),
      systemNames: new Map(),
    });
    const merged = mergeSrpReads([srp(A, true, false), srp(B, false, true)]);
    const feeds = {
      corpSrpAll: state({
        ...base,
        ...merged.body,
        corporationOf: merged.corporationOf,
        corporations: new Map([
          [A, {}],
          [B, {}],
        ]),
        partlyFailed: false,
      }),
    } as unknown as Feeds;
    const off = narrowFeedsToCorporation(feeds, B).corpSrpAll!.data!;
    expect(off.enabled).toBe(false);
    expect(off.canSetUp).toBe(true);
    expect(off.claims).toEqual([]);
  });
});
