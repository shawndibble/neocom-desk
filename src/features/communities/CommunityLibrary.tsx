import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { bpcSourcingCommunityHref } from '@/features/bpcContracts/bpcSourcingUrl';
import {
  buttonClassName,
  Caret,
  EmptyState,
  InfoTooltip,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tooltip,
  CachedNotice,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import {
  buildLibraryRows,
  filterLibraryRows,
  type LibraryFilter,
  type LibraryRow,
  type MemberLibrary,
} from '@/engine/communities/libraryMatrix';
import { isLibraryStale } from '@/engine/communities/sharedLibrary';
import {
  blueprintGroupOfProductGroup,
  buildShareTree,
  type BlueprintTypeInfo,
  type ShareGroup,
  type ShareMarketGroup,
} from '@/engine/communities/shareTree';
import { formatAge } from '@/lib/age';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { loadBlueprints } from '@/sde/loadSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { uidForCharacter } from '@/sync/uid';
import { loadMemberLibrariesFor, type CommunityMember } from './communityStore';
import { loadLibrariesWithFallback } from './communityCache';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { useReconnectCount } from '@/stores/network';
import { sharedBlueprintRows, systemIdsByName } from './sharedBlueprintCopies';
import { SharedBlueprintTable } from './SharedBlueprintTable';

const FILTERS: LibraryFilter[] = ['missingCommunity', 'ownedByMe', 'missingFromMe'];

/** "Shared in the Community" (each shared blueprint, the default) or one of the matrix filters. */
type LibraryView = 'shared' | LibraryFilter;
const VIEWS: LibraryView[] = ['shared', ...FILTERS];

type Loaded = {
  catalog: BlueprintTypeInfo[];
  groups: ShareMarketGroup[];
  learned: Map<number, number>;
  libraries: MemberLibrary[];
  /** The Members' libraries are the last ones read while online (`communityCache.ts`). */
  cached: boolean;
};

/** A Member's initial in a ring: portraits need the Character id, which a Member doc does not carry. */
function MemberDot({ member, stale }: { member: CommunityMember; stale: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-6 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-[0.6875rem] font-semibold ${stale ? 'opacity-60' : ''}`}
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
        className="flex min-h-9 w-full items-center gap-1 text-left text-xs font-medium hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
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
                            <span aria-hidden="true" className="text-[0.6875rem] font-medium">
                              {t(
                                holder.hasOriginal
                                  ? 'communities.library.bpo'
                                  : 'communities.library.bpc'
                              )}
                            </span>
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
 * The Community Library (issue #3601), the Blueprints tab's Everyone view:
 * what the Members share. It opens on "Shared in the Community": each shared
 * blueprint with its Member, station or structure, jumps from here, ME / TE
 * and runs, and a ⋮ to Show info, plan a build, source it or route there. The
 * other chips turn to every blueprint in the SDE against the Members who share
 * it: "missing from the Community", "owned by me" or
 * "missing from me", in a market-group tree that counts each category. A
 * stale Member is greyed and badged, never hidden. BPC Sourcing is one link
 * away, to source a copy.
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
  const [view, setView] = useState<LibraryView>('shared');
  const filter: LibraryFilter = view === 'shared' ? 'missingCommunity' : view;
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const reconnects = useReconnectCount();
  // Apart from the Library's own load: only the Jumps column waits on it, and
  // an unreadable list leaves that column at its placeholder, nothing else.
  const [systemIds, setSystemIds] = useState<ReadonlyMap<string, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSolarSystemsById().then((systems) => {
      // Unreadable: an empty lookup, so every Jumps cell settles on "—".
      if (!cancelled) setSystemIds(systems ? systemIdsByName(systems.values()) : new Map());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Each Member with the library stamp the roster carries: a new stamp is a new library.
  const memberKey = members
    ? members
        .map((member) => `${member.uid}@${member.libraryAsOf ?? ''}`)
        .sort()
        .join(',')
    : null;
  useEffect(() => {
    if (memberKey === null) return;
    let cancelled = false;
    (async () => {
      try {
        const roster = (memberKey ? memberKey.split(',') : []).map((entry) => {
          const [uid, asOf] = entry.split('@');
          return { uid, libraryAsOf: asOf ? Number(asOf) : null };
        });
        const uids = roster.map((member) => member.uid);
        // Offline, or with every read failed, the saved libraries answer; one
        // Member unreadable while online reads empty and the rest still show.
        const [{ libraries, cached }, groups, marketTypes, blueprints] = await Promise.all([
          loadLibrariesWithFallback(characterId, communityId, uids, () =>
            loadMemberLibrariesFor(characterId, communityId, roster)
          ),
          loadMarketGroups(),
          // The lazy market catalogue only files blueprints under market
          // groups: without it they list under "Other" rather than not at all.
          loadMarketTypes().catch((): MarketTypeEntry[] => []),
          loadBlueprints(),
        ]);
        if (cancelled) return;
        const groupByType = new Map(marketTypes.map((type) => [type.typeId, type.marketGroupId]));
        const catalog = Object.entries(blueprints).map(([typeId, blueprint]) => ({
          typeId: Number(typeId),
          name: blueprint.name,
          marketGroupId: groupByType.get(Number(typeId)) ?? null,
          productMarketGroupId: groupByType.get(blueprint.products[0]?.typeID) ?? null,
        }));
        setLoaded({
          libraries,
          groups,
          catalog,
          learned: blueprintGroupOfProductGroup(catalog, groups),
          cached,
        });
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, memberKey, reconnects]);

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
    () =>
      loaded
        ? buildShareTree(shown, loaded.groups, t('communities.library.other'), loaded.learned)
        : [],
    [loaded, shown, t]
  );
  const staleUids = useMemo(
    () =>
      new Set(
        (members ?? [])
          .filter((member) => isLibraryStale(member.libraryAsOf, now))
          .map((member) => member.uid)
      ),
    [members, now]
  );
  const copies = useMemo(
    () =>
      loaded
        ? sharedBlueprintRows(
            loaded.libraries,
            members ?? [],
            new Map(loaded.catalog.map((type) => [type.typeId, type.name])),
            staleUids,
            query
          )
        : [],
    [loaded, members, staleUids, query]
  );
  const counts = useMemo(
    () =>
      ({
        shared: copies.length,
        ...Object.fromEntries(
          FILTERS.map((id) => [id, filterLibraryRows(allRows, myUid, id, query).length])
        ),
      }) as Record<LibraryView, number>,
    [allRows, myUid, query, copies]
  );

  if (membersFailed || (failed && !loaded)) {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.library.loadFailed')}
      </p>
    );
  }
  if (!members || !loaded) return <Spinner size="sm" label={t('communities.loading')} />;

  return (
    <div className="space-y-3">
      {loaded.cached && <CachedNotice fetchedAt={null} />}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-40 flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('communities.library.search')}
          aria-label={t('communities.library.search')}
        />
        <Select value={view} onValueChange={(id) => setView(id as LibraryView)}>
          <SelectTrigger
            aria-label={t('communities.library.filterLabel')}
            className="w-full sm:w-72"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIEWS.map((id) => (
              <SelectItem key={id} value={id}>
                {t('communities.library.viewOption', {
                  label: t(`communities.library.${id}`),
                  count: counts[id],
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Sourcing a copy leaves the Library, so it sits apart at the row's end. */}
        <span className="flex items-center gap-1 sm:ml-auto">
          <Link to={bpcSourcingCommunityHref()} className={buttonClassName({ size: 'md' })}>
            {t('communities.blueprints.browse')}
          </Link>
          <InfoTooltip
            label={t('communities.blueprints.browseAbout')}
            content={t('communities.blueprints.browseHint')}
            glyph="info"
          />
        </span>
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-dim">
        {members.map((member) => (
          <li key={member.uid} className={staleUids.has(member.uid) ? 'opacity-60' : ''}>
            {member.characterName}
            {member.libraryAsOf === null
              ? ` · ${t('communities.library.sharesNothing')}`
              : ` · ${t('communities.asOf', { age: formatAge(now - member.libraryAsOf, t) })}`}
            {staleUids.has(member.uid) && (
              <Pill className="ml-1">{t('communities.staleBadge')}</Pill>
            )}
          </li>
        ))}
      </ul>
      {view === 'shared' ? (
        <SharedBlueprintTable rows={copies} systemIds={systemIds} />
      ) : tree.length === 0 ? (
        <EmptyState title={t('communities.library.none')} />
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs text-text-dim">{t('communities.library.legend')}</p>
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
                  <button
                    type="button"
                    className="grid w-8 place-items-center py-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
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
