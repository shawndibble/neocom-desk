/**
 * One corporation out of a read across every corporation (a widget scoped to a corporation).
 *
 * The All reads already hold each corporation's rows apart (a `corporations` list, or a
 * `corporationOf` map by row key, or a corporation on the row), and their per-corporation
 * reads are cached, so a widget on one corporation narrows the All read rather than
 * making a read of its own: two widgets on two corporations, or one on All and one on a
 * corporation, share the one feed. Pure: it never fetches.
 */
import type { CorpAllFeed, CorpDeadlinesAllFeed, CorpFeedBase } from './corpFeeds';
import type { FeedId, FeedState, Feeds } from './types';

type Narrow = (data: never, corporationId: number) => unknown;

/** A feed of `CorpAllFeed` shape: one entry per corporation. */
function perCorporation(data: CorpAllFeed<CorpFeedBase>, corporationId: number) {
  return {
    ...data,
    corporations: data.corporations.filter((read) => read.corporationId === corporationId),
  };
}

function deadlines(data: CorpDeadlinesAllFeed, corporationId: number): CorpDeadlinesAllFeed {
  return {
    ...data,
    corporations: data.corporations.filter((slice) => slice.corporationId === corporationId),
  };
}

/**
 * A merged feed: `rows` is the array field, `keyOf` the key `corporationOf` is filed under.
 * The corporation's label stays and the others go, so the widget draws no Corporation column.
 */
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
      corporationOf: new Map(
        [...(data.corporationOf ?? [])].filter(([, corporation]) => corporation === corporationId)
      ),
    };
  };
}

const NARROW: { readonly [K in FeedId]?: Narrow } = {
  corpWalletAll: perCorporation as Narrow,
  corpJobsAll: perCorporation as Narrow,
  corpKillsAll: perCorporation as Narrow,
  corpDeadlinesAll: deadlines as Narrow,
  corpCustomsAll: merged('offices', (o: { office_id: number }) => String(o.office_id)) as Narrow,
  corpStarbasesAll: merged('starbases', (s: { starbaseId: number }) =>
    String(s.starbaseId)
  ) as Narrow,
  corpSovereigntyAll: merged('rows', (r: { key: string }) => r.key) as Narrow,
  corpContractsAll: merged('contracts', (c: { contract_id: number }) =>
    String(c.contract_id)
  ) as Narrow,
  corpOrdersAll: merged('orders', (o: { order_id: number }) => String(o.order_id)) as Narrow,
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

/** `feeds` with each corporation-spanning read cut down to `corporationId`; the rest as they are. */
export function narrowFeedsToCorporation(feeds: Feeds, corporationId: number): Feeds {
  const out: Record<string, FeedState<unknown> | undefined> = { ...feeds };
  for (const [id, narrow] of Object.entries(NARROW) as [FeedId, Narrow][]) {
    const state = feeds[id] as FeedState<unknown> | undefined;
    if (state?.data) out[id] = { ...state, data: narrow(state.data as never, corporationId) };
  }
  return out as Feeds;
}
