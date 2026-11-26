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
import { loadCorporationCeoId, loadCorporationMemberRoles, toMemberRoles } from './members';

const KEYS = {
  history: 'roleHistory',
  titles: 'titles',
  memberTitles: 'memberTitles',
} as const;

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

export interface RoleHolder {
  characterId: number;
  roles: string[];
  titles: string[];
}

export interface RoleAuditData {
  holders: RoleHolder[];
  changes: RoleChange[] | null;
  titlesKnown: boolean;
  names: ReadonlyMap<number, string>;
  ceoId: number | null;
  fetchedAt: Date | null;
  fromCache: boolean;
}

export type RoleAuditResult = { data: RoleAuditData } | { needsReauth: true };

export async function loadRoleAudit(
  characterId: number,
  corporationId: number,
  { withTitles }: { withTitles: boolean }
): Promise<RoleAuditResult> {
  const [roles, history, titles, memberTitles, ceoId] = await Promise.all([
    loadCorporationMemberRoles(characterId, corporationId),
    loadCorporationRoleHistory(characterId, corporationId),
    withTitles ? loadCorporationTitles(characterId, corporationId) : null,
    withTitles ? loadCorporationMemberTitles(characterId, corporationId) : null,
    loadCorporationCeoId(corporationId),
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
      ceoId,
      fetchedAt: reads.map((c) => c.fetchedAt).reduce((a, b) => (a < b ? a : b)),
      fromCache: reads.some((c) => c.fromCache),
    },
  };
}
