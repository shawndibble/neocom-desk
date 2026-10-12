import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, EmptyState, FilterChip, SearchInput, Spinner, Tooltip } from '@/components/ui';
import {
  buildLibraryRows,
  filterLibraryRows,
  type LibraryFilter,
  type LibraryRow,
  type MemberLibrary,
} from '@/engine/communities/libraryMatrix';
import { isLibraryStale } from '@/engine/communities/sharedLibrary';
import {
  buildShareTree,
  type BlueprintTypeInfo,
  type ShareGroup,
  type ShareMarketGroup,
} from '@/engine/communities/shareTree';
import { formatAge } from '@/lib/age';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { loadBlueprints } from '@/sde/loadSde';
import { uidForCharacter } from '@/sync/uid';
import { loadMemberLibraries, type CommunityMember } from './communityStore';

const FILTERS: LibraryFilter[] = ['missingCommunity', 'ownedByMe', 'missingFromMe'];

type Loaded = {
  catalog: BlueprintTypeInfo[];
  groups: ShareMarketGroup[];
  libraries: MemberLibrary[];
};

/** A Member's initial in a ring: portraits need the Character id, which a Member doc does not carry. */
function MemberDot({ member, stale }: { member: CommunityMember; stale: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[0.6875rem] font-semibold ${stale ? 'opacity-60' : ''}`}
    >
      {member.characterName.charAt(0).toUpperCase()}
    </span>
  );
}

function LibraryGroup({
  group,
  depth,
  rows,
  members,
  staleUids,
  forceOpen,
}: {
  group: ShareGroup;
  depth: number;
  rows: ReadonlyMap<number, LibraryRow>;
  members: readonly CommunityMember[];
  staleUids: ReadonlySet<string>;
  forceOpen: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const expanded = open || forceOpen;
  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        className="flex min-h-9 w-full items-center gap-1 text-left text-xs font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setOpen(!open)}
      >
        <Caret expanded={expanded} />
        <span className="min-w-0 truncate">{group.name}</span>
        <span className="ml-auto pr-1 text-text-dim">
          {t('communities.library.count', { count: group.total })}
        </span>
      </button>
      {expanded && (
        <ul>
          {group.children.map((child) => (
            <LibraryGroup
              key={child.id}
              group={child}
              depth={depth + 1}
              rows={rows}
              members={members}
              staleUids={staleUids}
              forceOpen={forceOpen}
            />
          ))}
          {group.types.map((type) => {
            const row = rows.get(type.typeId);
            if (!row) return null;
            const heldBy = new Map(row.holders.map((holder) => [holder.uid, holder]));
            const holding = members.filter((member) => heldBy.has(member.uid));
            return (
              <li
                key={type.typeId}
                className="flex items-center gap-2 border-t border-line py-1 text-xs"
                style={{ paddingLeft: (depth + 1) * 16 + 20 }}
              >
                <span className="min-w-0 flex-1 truncate">{type.name}</span>
                {/* Desktop: one cell per Member, the matrix. */}
                <span className="hidden shrink-0 md:flex">
                  {members.map((member) => {
                    const holder = heldBy.get(member.uid);
                    return (
                      <span key={member.uid} className="grid w-8 place-items-center">
                        {holder && (
                          <span
                            className={staleUids.has(member.uid) ? 'opacity-60' : ''}
                            role="img"
                            aria-label={t(
                              holder.hasOriginal
                                ? 'communities.library.holdsOriginal'
                                : 'communities.library.holdsCopies',
                              { name: member.characterName }
                            )}
                          >
                            {holder.hasOriginal ? '●' : '○'}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
                {/* Phone: an avatar stack of who holds it. */}
                <span
                  className="flex shrink-0 items-center md:hidden"
                  role="img"
                  aria-label={
                    holding.length === 0
                      ? t('communities.library.nobody')
                      : t('communities.library.holders', { count: holding.length })
                  }
                >
                  {holding.slice(0, 4).map((member, index) => (
                    <span key={member.uid} className={index === 0 ? '' : '-ml-2'}>
                      <MemberDot member={member} stale={staleUids.has(member.uid)} />
                    </span>
                  ))}
                  {holding.length > 4 && (
                    <span className="ml-1 text-text-dim">+{holding.length - 4}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * The Community Library tab (issue #3601): every blueprint in the SDE against
 * the Members who share it. Filter chips pick "missing from the Community"
 * (default), "owned by me" or "missing from me"; the market-group tree counts
 * each category. A stale Member is greyed and badged, never hidden.
 */
export function CommunityLibrary({
  communityId,
  characterId,
  members,
  membersFailed,
  now,
}: {
  communityId: string;
  characterId: number;
  members: CommunityMember[] | null;
  membersFailed: boolean;
  now: number;
}) {
  const { t } = useTranslation();
  const myUid = uidForCharacter(characterId);
  const [filter, setFilter] = useState<LibraryFilter>('missingCommunity');
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  const memberKey = members
    ? members
        .map((member) => member.uid)
        .sort()
        .join(',')
    : null;
  useEffect(() => {
    if (memberKey === null) return;
    let cancelled = false;
    (async () => {
      try {
        const [libraries, groups, marketTypes, blueprints] = await Promise.all([
          loadMemberLibraries(characterId, communityId, memberKey ? memberKey.split(',') : []),
          loadMarketGroups(),
          loadMarketTypes(),
          loadBlueprints(),
        ]);
        if (cancelled) return;
        const groupByType = new Map(marketTypes.map((type) => [type.typeId, type.marketGroupId]));
        setLoaded({
          libraries,
          groups,
          catalog: Object.entries(blueprints).map(([typeId, blueprint]) => ({
            typeId: Number(typeId),
            name: blueprint.name,
            marketGroupId: groupByType.get(Number(typeId)) ?? null,
          })),
        });
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, memberKey]);

  const allRows = useMemo(
    () => (loaded ? buildLibraryRows(loaded.catalog, loaded.libraries) : []),
    [loaded]
  );
  const shown = useMemo(
    () => filterLibraryRows(allRows, myUid, filter, query),
    [allRows, myUid, filter, query]
  );
  const rowsByType = useMemo(() => new Map(shown.map((row) => [row.typeId, row])), [shown]);
  const tree = useMemo(
    () => (loaded ? buildShareTree(shown, loaded.groups, t('communities.library.other')) : []),
    [loaded, shown, t]
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((id) => [id, filterLibraryRows(allRows, myUid, id, query).length])
      ) as Record<LibraryFilter, number>,
    [allRows, myUid, query]
  );

  if (membersFailed || (failed && !loaded)) {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.library.loadFailed')}
      </p>
    );
  }
  if (!members || !loaded) return <Spinner size="sm" label={t('communities.loading')} />;

  const staleUids = new Set(
    members.filter((member) => isLibraryStale(member.libraryAsOf, now)).map((member) => member.uid)
  );

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('communities.library.filterLabel')}
      >
        {FILTERS.map((id) => (
          <FilterChip
            key={id}
            label={t(`communities.library.${id}`)}
            count={counts[id]}
            selected={filter === id}
            onToggle={() => setFilter(id)}
          />
        ))}
        <SearchInput
          className="min-w-40 flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('communities.library.search')}
          aria-label={t('communities.library.search')}
        />
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-dim">
        {members.map((member) => (
          <li key={member.uid} className={staleUids.has(member.uid) ? 'opacity-60' : ''}>
            {member.characterName}
            {member.libraryAsOf === null
              ? ` · ${t('communities.library.sharesNothing')}`
              : ` · ${t('communities.asOf', { age: formatAge(now - member.libraryAsOf, t) })}`}
            {staleUids.has(member.uid) && (
              <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem]">
                {t('communities.staleBadge')}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-dim">{t('communities.library.legend')}</p>

      {tree.length === 0 ? (
        <EmptyState title={t('communities.library.none')} />
      ) : (
        <div className="overflow-x-auto">
          <div className="hidden items-center justify-end md:flex">
            {members.map((member) => {
              const stale = staleUids.has(member.uid);
              return (
                <Tooltip
                  key={member.uid}
                  content={
                    member.libraryAsOf === null
                      ? member.characterName
                      : stale
                        ? t('communities.library.stale', {
                            name: member.characterName,
                            age: formatAge(now - member.libraryAsOf, t),
                          })
                        : `${member.characterName} · ${t('communities.asOf', { age: formatAge(now - member.libraryAsOf, t) })}`
                  }
                >
                  <button type="button" className="grid w-8 place-items-center py-1">
                    <MemberDot member={member} stale={stale} />
                    <span className="sr-only">{member.characterName}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
          <ul className="min-w-0">
            {tree.map((group) => (
              <LibraryGroup
                key={group.id}
                group={group}
                depth={0}
                rows={rowsByType}
                members={members}
                staleUids={staleUids}
                forceOpen={query.trim() !== ''}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
