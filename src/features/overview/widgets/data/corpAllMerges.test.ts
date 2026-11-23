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
