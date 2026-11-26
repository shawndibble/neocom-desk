import type { CachedResult, StatusResult } from '@/esi/cache';
import { CorpReadFailed } from '@/features/corp/corpRead';
import { resolveCorpReadAccess, type CorpCapability } from '@/features/corp/corpReadAccess';
import type { CorpFeedBase } from './corpFeeds';

export type CorpFeedBody<F extends CorpFeedBase> = Omit<F, keyof CorpFeedBase>;

export interface CorpReadContext {
  characterId: number;
  corporationId: number;
  can: (capability: CorpCapability) => boolean;
}

export type CorpReadAge = Pick<CorpFeedBase, 'fetchedAt' | 'fromCache'>;

export type CorpReadOutcome<B> =
  | { reads: readonly (StatusResult<unknown> | null)[]; body: B }
  | { age: CorpReadAge; body: B }
  | { unreadable: true }
  | { needsReauth: true };

export interface CorpFeedSpec<B> {
  capability: CorpCapability;
  empty: B;
  read: (ctx: CorpReadContext) => Promise<CorpReadOutcome<B>>;
}

export function readAge(results: readonly (StatusResult<unknown> | null)[]): CorpReadAge {
  const cached = results
    .map((result) => result?.cached)
    .filter((c): c is CachedResult<unknown> => c !== null && c !== undefined);
  const fetchedAt =
    cached.length === 0
      ? null
      : cached.map((c) => c.fetchedAt).reduce((oldest, at) => (at < oldest ? at : oldest));
  return { fetchedAt, fromCache: cached.some((c) => c.fromCache) };
}

export function unlanded(
  what: string,
  ...results: readonly (StatusResult<unknown> | null)[]
): { needsReauth: true } {
  if (results.some((result) => result?.needsReauth)) return { needsReauth: true };
  throw new CorpReadFailed(what);
}

export const UNREADABLE = {
  readable: false,
  needsReauth: false,
  fetchedAt: null,
  fromCache: false,
};

export async function readCorpFeed<F extends CorpFeedBase>(
  characterId: number,
  spec: CorpFeedSpec<CorpFeedBody<F>>
): Promise<F> {
  const unreadable = (needsReauth: boolean) => ({ ...UNREADABLE, needsReauth, ...spec.empty }) as F;
  const access = await resolveCorpReadAccess(characterId);
  if (access === null || !access.can(spec.capability)) return unreadable(false);
  const outcome = await spec.read({
    characterId,
    corporationId: access.corporationId,
    can: (capability) => access.can(capability),
  });
  if ('needsReauth' in outcome) return unreadable(true);
  if ('unreadable' in outcome) return unreadable(false);
  const age = 'age' in outcome ? outcome.age : readAge(outcome.reads);
  return { readable: true, needsReauth: false, ...age, ...outcome.body } as F;
}
