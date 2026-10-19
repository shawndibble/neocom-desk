import { db } from '@/db';
import type { CachedResult } from '@/esi/cache';
import type { CharacterAffiliation, MailHeader, MailLabel, MailingList } from '@/esi/endpoints';
import { buildLabelTabMap, type MailTab } from '@/engine/mail/mail';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { resolveAffiliations } from './affiliations';
import { loadContacts } from './contacts';
import { buildContactStandingIndex, type ContactStandingIndex } from './contactStandings';
import { loadMailOwner, type MailOwnerLoad } from './mail';
import { loadMailForCharacters, type SkippedMailCharacter } from './mailAll';
import { resolveCategories, resolveNames } from './names';

/** One mailbox's slice of a snapshot: the single view has exactly one, the All view one per covered Character. */
export interface OwnerSnapshot {
  characterId: number;
  name: string;
  /** Null only in the single view, when nothing is cached and the fetch failed. */
  headersResult: CachedResult<MailHeader[]> | null;
  labels: readonly MailLabel[];
  /** `label_id` differs per Character, so each mailbox resolves its own folders. */
  labelTabById: ReadonlyMap<number, MailTab>;
  /** True when a `last_mail_id` page beyond this list may exist (issue #161). */
  hasMore: boolean;
  /**
   * This Character's own contact list, indexed once per snapshot. Empty
   * (never missing) when the contacts scope isn't granted — a stranger's tag
   * is simply absent, not an error the page needs to surface.
   */
  standingIndex: ContactStandingIndex;
}

export interface Snapshot {
  owners: OwnerSnapshot[];
  /** All view only: Characters left out, for the scope readout and their grant notes. */
  skipped: SkippedMailCharacter[];
  /** 401/403 (or a failed token refresh) on any call means "log in again", not "offline". Single view only. */
  needsReauth: boolean;
  /** Sender + non-mailing-list recipient names, resolved together in one batch. */
  names: Map<number, string>;
  /** Every covered Character's mailing lists — list ids are global, so one map names them all (issue #416). */
  mailingLists: MailingList[];
  /** Each sender's corp/alliance/faction, so a sender with no personal contact entry can still match one the pilot holds on their corp. Senders only — Mail's standing tag is scoped to "who sent this", not every recipient. */
  senderAffiliations: Map<number, CharacterAffiliation>;
}

/** Stable identity for the loading/failed fallback, so it doesn't churn every render. */
export const NO_OWNERS: readonly OwnerSnapshot[] = [];
export const NO_MAILING_LISTS: readonly MailingList[] = [];
export const NO_STANDING_INDEX: ContactStandingIndex = new Map();
export const NO_HAS_MORE: ReadonlyMap<number, boolean> = new Map();

/**
 * Sender + recipient ids to look up for these headers. Mailing-list recipient
 * ids are excluded: `/universe/names` can't resolve them and fails the whole
 * batch on an unresolvable id, which would blank every other name in the same
 * mail.
 */
export function namePartyIds(headers: readonly MailHeader[]): number[] {
  return headers.flatMap((header) => [
    ...(header.from !== undefined ? [header.from] : []),
    ...(header.recipients ?? [])
      .filter((r) => r.recipient_type !== 'mailing_list')
      .map((r) => r.recipient_id),
  ]);
}

/** Senders only — the standing tag is scoped to "who sent this", never a recipient. */
export function senderIds(headers: readonly MailHeader[]): number[] {
  return headers.flatMap((header) => (header.from !== undefined ? [header.from] : []));
}

/**
 * Affiliations for the senders that are characters. A sender can also be a
 * corporation, alliance or NPC, and one such id makes `/characters/affiliation`
 * reject the whole batch with 400 "Invalid character ID".
 */
export async function resolveSenderAffiliations(
  headers: readonly MailHeader[]
): Promise<Map<number, CharacterAffiliation>> {
  const senders = senderIds(headers);
  const categories = await resolveCategories(senders);
  return resolveAffiliations(senders.filter((id) => categories.get(id) === 'character'));
}

interface LoadedOwner {
  characterId: number;
  name: string;
  load: MailOwnerLoad;
}

async function buildSnapshot(
  loaded: readonly LoadedOwner[],
  skipped: SkippedMailCharacter[],
  needsReauth: boolean,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const allHeaders = loaded.flatMap((o) => o.load.headers?.data ?? []);
  // Already superseded: skip the name/standing lookups, their results would be discarded.
  const ids = signal.cancelled ? [] : namePartyIds(allHeaders);
  const [names, contacts, senderAffiliations] = await Promise.all([
    resolveNames(ids),
    Promise.all(
      loaded.map((o) => (signal.cancelled ? Promise.resolve(null) : loadContacts(o.characterId)))
    ),
    resolveSenderAffiliations(signal.cancelled ? [] : allHeaders),
  ]);
  const owners = loaded.map((o, i): OwnerSnapshot => {
    const labels = o.load.labels?.data.labels ?? [];
    return {
      characterId: o.characterId,
      name: o.name,
      headersResult: o.load.headers,
      labels,
      labelTabById: buildLabelTabMap(labels),
      hasMore: o.load.hasMore,
      standingIndex: buildContactStandingIndex(contacts[i]?.cached?.data ?? []),
    };
  });
  return {
    owners,
    skipped,
    needsReauth,
    names,
    mailingLists: loaded.flatMap((o) => o.load.lists),
    senderAffiliations,
  };
}

export async function loadMailSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const load = await loadMailOwner(characterId);
  return buildSnapshot([{ characterId, name: '', load }], [], load.needsReauth, signal);
}

/** The All view: every Character's mailbox, through the per-Character throttle (`mailAll.ts`). */
export async function loadAllMailSnapshot(
  _characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const characters = await db.characters.toArray();
  const { owners, skipped } = await loadMailForCharacters(characters);
  return buildSnapshot(
    owners.map((o) => ({ characterId: o.characterId, name: o.name, load: o })),
    skipped,
    false,
    signal
  );
}
