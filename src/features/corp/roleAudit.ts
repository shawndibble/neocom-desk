/**
 * Fetch + cache layer for the corporation role audit (issue #4613): the role
 * change history, the titles and who holds them. Same shape as `members.ts`:
 * corp-keyed cache, corp-aware 403 handling. The roles read itself is
 * `loadCorporationMemberRoles` in `members.ts`.
 *
 * All three are Director-only and cached an hour by ESI. History holds about a
 * month and is paginated (X-Pages); titles are the only reads on
 * `esi-corporations.read_titles.v1`, the additive scope.
 */
import { conditionalFetch, conditionalPagedFetch } from '@/esi/cache';
import type { StatusResult } from '@/esi/cache';
import {
  getCorporationMemberTitles,
  getCorporationRoleHistory,
  getCorporationTitles,
  type CorporationMemberTitles,
  type CorporationRoleHistory,
  type CorporationTitle,
} from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { sensitiveRolesOf, toRoleChanges, type RoleChange } from '@/engine/corp/roleAudit';
import {
  CorpReadFailed,
  loadCorpPaginatedWithCacheStatus,
  loadCorpWithCacheStatus,
} from './corpRead';
import { loadCorporationMemberRoles, toMemberRoles } from './members';

const KEYS = {
  history: 'roleHistory',
  titles: 'titles',
  memberTitles: 'memberTitles',
} as const;

/** Role changes, about the last month. */
export function loadCorporationRoleHistory(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationRoleHistory[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationRoleHistory(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEYS.history, fetchLive, {
    conditional,
  });
}

/** The corporation's titles. */
export function loadCorporationTitles(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationTitle[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationTitles(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, KEYS.titles, fetchLive, {
    conditional,
  });
}

/** The title ids each member holds. */
export function loadCorporationMemberTitles(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMemberTitles[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationMemberTitles(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, KEYS.memberTitles, fetchLive, {
    conditional,
  });
}

/** Title names by member. An unnamed title is dropped; a member with none gets `[]`. */
export function toMemberTitleNames(
  titles: readonly CorporationTitle[],
  memberTitles: readonly CorporationMemberTitles[]
): ReadonlyMap<number, readonly string[]> {
  const names = new Map(titles.map((title) => [title.title_id, title.name?.trim() ?? '']));
  return new Map(
    memberTitles.map((row) => [
      row.character_id,
      row.titles.map((id) => names.get(id) ?? '').filter((name) => name !== ''),
    ])
  );
}

/** A member holding at least one sensitive role. */
export interface RoleHolder {
  characterId: number;
  /** Sensitive roles only, `SENSITIVE_ROLES` order. */
  roles: string[];
  /** Title names; empty when none, or when titles were not read. */
  titles: string[];
}

export interface RoleAuditData {
  holders: RoleHolder[];
  /** Sensitive changes, newest first; null when the history read failed (not "no changes"). */
  changes: RoleChange[] | null;
  /** Whether the titles reads landed (a hidden titles column otherwise). */
  titlesKnown: boolean;
  names: ReadonlyMap<number, string>;
  fetchedAt: Date | null;
  fromCache: boolean;
}

export type RoleAuditResult = { data: RoleAuditData } | { needsReauth: true };

/**
 * The audit's reads, joined. Roles are the data: without them nothing can be
 * said, so that read throws (or asks for a grant). History and titles degrade
 * one part each. Titles are read only when `withTitles` (the Roles tab).
 */
export async function loadRoleAudit(
  characterId: number,
  corporationId: number,
  { withTitles }: { withTitles: boolean }
): Promise<RoleAuditResult> {
  const [roles, history, titles, memberTitles] = await Promise.all([
    loadCorporationMemberRoles(characterId, corporationId),
    loadCorporationRoleHistory(characterId, corporationId),
    withTitles ? loadCorporationTitles(characterId, corporationId) : null,
    withTitles ? loadCorporationMemberTitles(characterId, corporationId) : null,
  ]);
  if (roles.cached === null) {
    if (roles.needsReauth) return { needsReauth: true };
    throw new CorpReadFailed('member roles');
  }
  const titlesKnown = titles?.cached != null && memberTitles?.cached != null;
  const titleNames =
    titles?.cached != null && memberTitles?.cached != null
      ? toMemberTitleNames(titles.cached.data, memberTitles.cached.data)
      : new Map<number, readonly string[]>();
  const holders = [...toMemberRoles(roles.cached.data)].flatMap(([id, held]) => {
    const sensitive = sensitiveRolesOf(held);
    return sensitive.length === 0
      ? []
      : [{ characterId: id, roles: sensitive, titles: [...(titleNames.get(id) ?? [])] }];
  });
  const changes = history.cached === null ? null : toRoleChanges(history.cached.data);
  const names = await resolveNames([
    ...new Set([
      ...holders.map((holder) => holder.characterId),
      ...(changes ?? []).flatMap((change) => [change.characterId, change.issuerId]),
    ]),
  ]);
  const reads = [roles, history, titles, memberTitles].flatMap((read) =>
    read?.cached ? [read.cached] : []
  );
  return {
    data: {
      holders,
      changes,
      titlesKnown,
      names,
      fetchedAt: reads.map((c) => c.fetchedAt).reduce((a, b) => (a < b ? a : b)),
      fromCache: reads.some((c) => c.fromCache),
    },
  };
}
