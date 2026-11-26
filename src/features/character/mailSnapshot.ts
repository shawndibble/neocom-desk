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

export interface OwnerSnapshot {
  characterId: number;
  name: string;
  headersResult: CachedResult<MailHeader[]> | null;
  labels: readonly MailLabel[];
  labelTabById: ReadonlyMap<number, MailTab>;
  hasMore: boolean;
  standingIndex: ContactStandingIndex;
}

export interface Snapshot {
  owners: OwnerSnapshot[];
  skipped: SkippedMailCharacter[];
  needsReauth: boolean;
  names: Map<number, string>;
  mailingLists: MailingList[];
  senderAffiliations: Map<number, CharacterAffiliation>;
}

export const NO_OWNERS: readonly OwnerSnapshot[] = [];
export const NO_MAILING_LISTS: readonly MailingList[] = [];
export const NO_STANDING_INDEX: ContactStandingIndex = new Map();
export const NO_HAS_MORE: ReadonlyMap<number, boolean> = new Map();

export function namePartyIds(headers: readonly MailHeader[]): number[] {
  return headers.flatMap((header) => [
    ...(header.from !== undefined ? [header.from] : []),
    ...(header.recipients ?? [])
      .filter((r) => r.recipient_type !== 'mailing_list')
      .map((r) => r.recipient_id),
  ]);
}

export function senderIds(headers: readonly MailHeader[]): number[] {
  return headers.flatMap((header) => (header.from !== undefined ? [header.from] : []));
}

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
