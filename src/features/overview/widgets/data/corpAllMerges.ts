import { mergeCorpRows, mergeLookups } from '@/engine/corp/corpMerge';
import { oldest } from '../../data/corpBoard';
import type { CorpMembersFeed, CorpRoleAuditFeed, CorpSrpFeed } from './corpFeeds';
import { changeKey, characterKey, joinedKey, leftKey, srpClaimKey } from './corpRowKeys';

type Tagged<F> = F & { corporationId: number };

export function mergeSrpReads(reads: readonly Tagged<CorpSrpFeed>[]) {
  const { rows, corporationOf } = mergeCorpRows(
    reads.map((read) => ({ corporationId: read.corporationId, rows: read.claims })),
    srpClaimKey
  );
  return {
    corporationOf,
    body: {
      enabled: reads.some((read) => read.enabled),
      canSetUp: reads.some((read) => read.canSetUp),
      claims: rows,
      byCorporation: new Map(
        reads.map((read) => [
          read.corporationId,
          { enabled: read.enabled, canSetUp: read.canSetUp },
        ])
      ),
      typeNames: mergeLookups(reads.map((read) => read.typeNames)),
      systemNames: mergeLookups(reads.map((read) => read.systemNames)),
    },
  };
}

export function mergeMembersReads(reads: readonly Tagged<CorpMembersFeed>[]) {
  const { rows, corporationOf } = mergeCorpRows(
    reads.map((read) => ({ corporationId: read.corporationId, rows: read.members })),
    characterKey
  );
  for (const read of reads) {
    for (const id of read.diff?.joined ?? []) corporationOf.set(joinedKey(id), read.corporationId);
    for (const id of read.diff?.left ?? []) corporationOf.set(leftKey(id), read.corporationId);
  }
  const diffs = reads.flatMap((read) => (read.diff ? [read.diff] : []));
  return {
    corporationOf,
    body: {
      members: rows,
      diff:
        diffs.length === 0
          ? null
          : {
              joined: diffs.flatMap((diff) => diff.joined),
              left: diffs.flatMap((diff) => diff.left),
            },
      names: mergeLookups(reads.map((read) => read.names)),
      darkAfterDays: reads[0]?.darkAfterDays ?? 0,
      loadedAt: Math.max(0, ...reads.map((read) => read.loadedAt)),
    },
  };
}

export function mergeRoleAuditReads(reads: readonly Tagged<CorpRoleAuditFeed>[]) {
  const audits = reads.flatMap((read) => (read.audit ? [read.audit] : []));
  const { rows: holders, corporationOf } = mergeCorpRows(
    reads.map((read) => ({ corporationId: read.corporationId, rows: read.audit?.holders ?? [] })),
    characterKey
  );
  for (const read of reads) {
    for (const change of read.audit?.changes ?? []) {
      corporationOf.set(changeKey(change.characterId), read.corporationId);
    }
  }
  const histories = audits.flatMap((audit) => (audit.changes ? [audit.changes] : []));
  return {
    corporationOf,
    body: {
      audit: {
        holders,
        changes:
          histories.length === 0
            ? null
            : histories.flat().sort((a, b) => b.changedAtMs - a.changedAtMs),
        titlesKnown: audits.every((audit) => audit.titlesKnown),
        names: mergeLookups(audits.map((audit) => audit.names)),
        ceoId: null,
        fetchedAt: oldest(audits.map((audit) => audit.fetchedAt)),
        fromCache: audits.some((audit) => audit.fromCache),
      },
    },
  };
}
