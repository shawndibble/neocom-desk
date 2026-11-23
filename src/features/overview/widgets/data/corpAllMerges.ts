/**
 * The merges behind the Corp Board's All reads of SRP, Members and Roles audit: each
 * corporation's own read folded into the one feed its widget already draws, with every row
 * filed under its corporation (`corporationOf`) so the widget can name it and a widget
 * scoped to one corporation can cut it back out (`corpNarrow.ts`). Pure, so they are tested
 * apart from the reads.
 */
import { mergeCorpRows, mergeLookups } from '@/engine/corp/corpMerge';
import { oldest } from '../../data/corpBoard';
import type { CorpMembersFeed, CorpRoleAuditFeed, CorpSrpFeed } from './corpFeeds';
import { characterKey, joinedKey, leftKey, srpClaimKey } from './corpRowKeys';

/** One corporation's read, tagged with its corporation. */
type Tagged<F> = F & { corporationId: number };

export function mergeSrpReads(reads: readonly Tagged<CorpSrpFeed>[]) {
  const { rows, corporationOf } = mergeCorpRows(
    reads.map((read) => ({ corporationId: read.corporationId, rows: read.claims })),
    srpClaimKey
  );
  return {
    corporationOf,
    body: {
      // On in any corporation read; a corporation with it off has no claims to add.
      enabled: reads.some((read) => read.enabled),
      canSetUp: reads.some((read) => read.canSetUp),
      claims: rows,
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
  // The roster's joined and left rows sit under their own keys.
  for (const read of reads) {
    for (const id of read.diff?.joined ?? []) corporationOf.set(joinedKey(id), read.corporationId);
    for (const id of read.diff?.left ?? []) corporationOf.set(leftKey(id), read.corporationId);
  }
  const diffs = reads.flatMap((read) => (read.diff ? [read.diff] : []));
  return {
    corporationOf,
    body: {
      members: rows,
      // Unknown only when no corporation could say; the others' changes still list.
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
  const histories = audits.flatMap((audit) => (audit.changes ? [audit.changes] : []));
  return {
    corporationOf,
    body: {
      audit: {
        holders,
        // Unknown only when no corporation's history read landed.
        changes:
          histories.length === 0
            ? null
            : histories.flat().sort((a, b) => b.changedAtMs - a.changedAtMs),
        titlesKnown: audits.every((audit) => audit.titlesKnown),
        names: mergeLookups(audits.map((audit) => audit.names)),
        // A merged audit has no one CEO: the widget reads `holders`, not this.
        ceoId: null,
        fetchedAt: oldest(audits.map((audit) => audit.fetchedAt)),
        fromCache: audits.some((audit) => audit.fromCache),
      },
    },
  };
}
