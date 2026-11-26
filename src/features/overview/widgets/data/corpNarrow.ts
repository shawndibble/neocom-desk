import {
  changeKey,
  characterKey,
  contractKey,
  customsOfficeKey,
  joinedKey,
  leftKey,
  orderKey,
  srpClaimKey,
  sovereigntyRowKey,
  starbaseKey,
} from './corpRowKeys';
import type {
  CorpAllFeed,
  CorpDeadlinesAllFeed,
  CorpFeedBase,
  CorpMembersFeed,
  CorpRoleAuditFeed,
  CorpSrpFeed,
} from './corpFeeds';
import type { FeedId, FeedState, Feeds } from './types';

type Narrow = (data: never, corporationId: number) => unknown;

function perCorporation(data: CorpAllFeed<CorpFeedBase>, corporationId: number) {
  const corporations = data.corporations.filter((read) => read.corporationId === corporationId);
  return { ...data, corporations, partlyFailed: data.partlyFailed && corporations.length === 0 };
}

function deadlines(data: CorpDeadlinesAllFeed, corporationId: number): CorpDeadlinesAllFeed {
  return {
    ...data,
    corporations: data.corporations.filter((slice) => slice.corporationId === corporationId),
  };
}

function merged<F extends CorpFeedBase, K extends keyof F>(
  field: K,
  keyOf: (row: never) => string
) {
  return (data: F, corporationId: number): F => {
    const own = (row: unknown) => data.corporationOf?.get(keyOf(row as never)) === corporationId;
    const label = data.corporations?.get(corporationId);
    return {
      ...data,
      [field]: (data[field] as unknown as unknown[]).filter(own),
      corporations: new Map(label ? [[corporationId, label]] : []),
      partlyFailed: data.partlyFailed === true && label === undefined,
      corporationOf: new Map(
        [...(data.corporationOf ?? [])].filter(([, corporation]) => corporation === corporationId)
      ),
    };
  };
}

function membersOf(data: CorpMembersFeed, corporationId: number): CorpMembersFeed {
  const own = (key: string) => data.corporationOf?.get(key) === corporationId;
  const narrowed = merged<CorpMembersFeed, 'members'>('members', characterKey as never)(
    data,
    corporationId
  );
  return {
    ...narrowed,
    diff: data.diff && {
      joined: data.diff.joined.filter((id) => own(joinedKey(id))),
      left: data.diff.left.filter((id) => own(leftKey(id))),
    },
  };
}

function roleAuditOf(data: CorpRoleAuditFeed, corporationId: number): CorpRoleAuditFeed {
  const own = (key: string) => data.corporationOf?.get(key) === corporationId;
  const label = data.corporations?.get(corporationId);
  return {
    ...data,
    audit: data.audit && {
      ...data.audit,
      holders: data.audit.holders.filter((holder) => own(characterKey(holder))),
      changes: data.audit.changes?.filter((change) => own(changeKey(change.characterId))) ?? null,
    },
    corporations: new Map(label ? [[corporationId, label]] : []),
    partlyFailed: data.partlyFailed === true && label === undefined,
    corporationOf: new Map(
      [...(data.corporationOf ?? [])].filter(([, corporation]) => corporation === corporationId)
    ),
  };
}

function srpOf(data: CorpSrpFeed, corporationId: number): CorpSrpFeed {
  const own = data.byCorporation?.get(corporationId);
  return {
    ...merged<CorpSrpFeed, 'claims'>('claims', srpClaimKey as never)(data, corporationId),
    ...(own && { enabled: own.enabled, canSetUp: own.canSetUp }),
  };
}

const NARROW: { readonly [K in FeedId]?: Narrow } = {
  corpWalletAll: perCorporation as Narrow,
  corpJobsAll: perCorporation as Narrow,
  corpKillsAll: perCorporation as Narrow,
  corpDeadlinesAll: deadlines as Narrow,
  corpCustomsAll: merged('offices', customsOfficeKey) as Narrow,
  corpStarbasesAll: merged('starbases', starbaseKey) as Narrow,
  corpSovereigntyAll: merged('rows', sovereigntyRowKey) as Narrow,
  corpContractsAll: merged('contracts', contractKey) as Narrow,
  corpOrdersAll: merged('orders', orderKey) as Narrow,
  corpAssetsAll: perCorporation as Narrow,
  corpSrpAll: srpOf as Narrow,
  corpMembersAll: membersOf as Narrow,
  corpRoleAuditAll: roleAuditOf as Narrow,
  structuresAll: ((
    data: {
      structures: { corporationId?: number }[] | null;
      corporations?: ReadonlyMap<number, unknown>;
    },
    corporationId: number
  ) => ({
    ...data,
    structures: data.structures?.filter((s) => s.corporationId === corporationId) ?? null,
    corporations: new Map([...(data.corporations ?? [])].filter(([id]) => id === corporationId)),
  })) as Narrow,
  moonChunksAll: ((
    data: {
      chunks: { id: string; corporation?: { id: number } }[] | null;
      extractions?: { structureId: number }[];
    },
    corporationId: number
  ) => {
    const chunks = data.chunks?.filter((c) => c.corporation?.id === corporationId) ?? null;
    const kept = new Set(chunks?.map((c) => c.id));
    return {
      ...data,
      chunks,
      extractions: data.extractions?.filter((e) => kept.has(String(e.structureId))),
    };
  }) as Narrow,
};

export function narrowFeedsToCorporation(feeds: Feeds, corporationId: number): Feeds {
  const out: Record<string, FeedState<unknown> | undefined> = { ...feeds };
  for (const [id, narrow] of Object.entries(NARROW) as [FeedId, Narrow][]) {
    const state = feeds[id] as FeedState<unknown> | undefined;
    if (state?.data) out[id] = { ...state, data: narrow(state.data as never, corporationId) };
  }
  return out as Feeds;
}
