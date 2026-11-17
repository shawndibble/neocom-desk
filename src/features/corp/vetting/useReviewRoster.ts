/**
 * The corporation's members for "Review a member": the Members page's own reads
 * (`../members.ts`, `../roleAudit.ts`), joined. The member list is the data; titles and last seen
 * are optional extras that a missing role or scope only leaves out.
 */
import { useCallback } from 'react';
import { resolveNames } from '@/features/character/names';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadCorporationMemberIds, loadCorporationMemberTracking } from '../members';
import {
  loadCorporationMemberTitles,
  loadCorporationTitles,
  toMemberTitleNames,
} from '../roleAudit';
import type { RosterMember } from './reviewRoster';

export interface ReviewRoster {
  members: RosterMember[];
  /** The corp's own title names, for the role chips. */
  titles: string[];
}

export type ReviewRosterState =
  | { status: 'loading' }
  /** The member list could not be read: the dialog asks for the exact name instead. */
  | { status: 'unreadable' }
  | { status: 'ready'; roster: ReviewRoster };

/** Resolves to null when the optional read had nothing. */
async function optional<T>(read: Promise<{ cached: { data: T } | null }>): Promise<T | null> {
  try {
    return (await read).cached?.data ?? null;
  } catch {
    return null;
  }
}

export async function loadReviewRoster(
  characterId: number,
  corporationId: number
): Promise<ReviewRoster> {
  const [idsRead, titles, memberTitles, tracking] = await Promise.all([
    loadCorporationMemberIds(characterId, corporationId),
    optional(loadCorporationTitles(characterId, corporationId)),
    optional(loadCorporationMemberTitles(characterId, corporationId)),
    optional(loadCorporationMemberTracking(characterId, corporationId)),
  ]);
  if (idsRead.cached === null) throw new Error('member list unreadable');
  const ids = idsRead.cached.data;
  const names = await resolveNames(ids);
  const titleNames =
    titles && memberTitles ? toMemberTitleNames(titles, memberTitles) : new Map<number, string[]>();
  const seen = new Map(
    (tracking ?? []).flatMap((row) => {
      const ms = Math.max(
        row.logon_date ? Date.parse(row.logon_date) : NaN,
        row.logoff_date ? Date.parse(row.logoff_date) : NaN
      );
      return Number.isNaN(ms) ? [] : [[row.character_id, ms] as const];
    })
  );
  const members: RosterMember[] = ids.flatMap((id) => {
    const name = names.get(id);
    if (name === undefined) return []; // Cannot be asked for by name.
    const title = titleNames.get(id)?.[0];
    const lastSeenMs = seen.get(id);
    return [
      {
        characterId: id,
        name,
        ...(title ? { title } : {}),
        ...(lastSeenMs !== undefined ? { lastSeenMs } : {}),
      },
    ];
  });
  return {
    members,
    titles: (titles ?? []).flatMap((title) => (title.name?.trim() ? [title.name.trim()] : [])),
  };
}

export function useReviewRoster(
  characterId: number | null,
  corporationId: number | null
): ReviewRosterState {
  const loader = useCallback(
    () => loadReviewRoster(characterId ?? 0, corporationId ?? 0),
    [characterId, corporationId]
  );
  const load = useKeyedLoad(
    characterId === null || corporationId === null ? null : `${characterId}:${corporationId}`,
    loader
  );
  if (load.status === 'ready') return { status: 'ready', roster: load.data };
  if (load.status === 'failed' || load.status === 'idle') return { status: 'unreadable' };
  return { status: 'loading' };
}
