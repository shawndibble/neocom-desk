/**
 * The one protocol every gated Corp Board feed follows, so a loader supplies
 * only its reads and its reduction (`corpFeedLoaders.ts`).
 *
 * `readCorpFeed` owns the access gate, the three-state outcome documented in
 * `corpFeeds.ts` and the read-age stamp:
 * - no corp access or no `capability`: the `empty` body, `readable: false`, and
 *   `read` never runs (no request, since CCP role-gates these server-side);
 * - `read` returns `unlanded(...)` or `{ needsReauth: true }`: unreadable with
 *   `needsReauth`; `{ unreadable: true }`: unreadable without it;
 * - `unlanded(...)` with nothing to fix by re-login: throws `CorpReadFailed`;
 * - `{ reads | age, body }`: `readable: true`, stamped with the oldest read.
 */
import type { CachedResult, StatusResult } from '@/esi/cache';
import { CorpReadFailed } from '@/features/corp/corpRead';
import { resolveCorpReadAccess, type CorpCapability } from '@/features/corp/corpReadAccess';
import type { CorpFeedBase } from './corpFeeds';

/** Everything a feed carries beyond the shared base fields. */
export type CorpFeedBody<F extends CorpFeedBase> = Omit<F, keyof CorpFeedBase>;

export interface CorpReadContext {
  characterId: number;
  corporationId: number;
  /** Another capability of the same access, for reads that widen on a second role. */
  can: (capability: CorpCapability) => boolean;
}

export type CorpReadAge = Pick<CorpFeedBase, 'fetchedAt' | 'fromCache'>;

/** What a feed's `read` answers with. */
export type CorpReadOutcome<B> =
  /** Data; the age is the oldest of `reads` that landed. */
  | { reads: readonly (StatusResult<unknown> | null)[]; body: B }
  /** Data whose age is not an ESI result's (Firestore, zKillboard, a derived row time). */
  | { age: CorpReadAge; body: B }
  | { unreadable: true }
  | { needsReauth: true };

export interface CorpFeedSpec<B> {
  capability: CorpCapability;
  /** The body of an unreadable feed. */
  empty: B;
  read: (ctx: CorpReadContext) => Promise<CorpReadOutcome<B>>;
}

/** The oldest read of those that landed, and whether any came from the saved copy. */
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

/**
 * The reads that left the feed with nothing: a lapsed grant on any of them asks
 * for a grant, otherwise the read failed and this throws, so the widget shows
 * Retry. A zero from a failed read would read as "all clear".
 */
export function unlanded(
  what: string,
  ...results: readonly (StatusResult<unknown> | null)[]
): { needsReauth: true } {
  if (results.some((result) => result?.needsReauth)) return { needsReauth: true };
  throw new CorpReadFailed(what);
}

/** The base fields of a feed that made no read. */
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
