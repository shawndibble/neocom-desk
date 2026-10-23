import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { rememberCommunityAdmin } from '@/features/communities/communityAlertEntries';
import { rememberCommunityWatch } from '@/features/communities/requestBadge';
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  RowCaret,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  CachedNotice,
  NeedsConnection,
} from '@/components/ui';
import {
  focusRingClassName,
  rowInteractiveClassName,
  selectedRowClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { db } from '@/db';
import { CommunityDetail } from '@/features/communities/CommunityDetail';
import { communityBadgeClassName } from '@/features/communities/communityBadge';
import { communityInitials } from '@/features/communities/communityInitials';
import {
  COMMUNITY_TABS,
  INVITES_TAB_PARAM,
  MINE_VIEW_PARAM,
} from '@/features/communities/communityTabs';
import { CreateCommunityDialog } from '@/features/communities/CreateCommunityDialog';
import {
  isCommunityAdmin,
  loadMyCommunities,
  type CommunitySummary,
} from '@/features/communities/communityStore';
import { loadWithSnapshot, pruneCommunitySnapshots } from '@/features/communities/communityCache';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useReconnectCount } from '@/stores/network';

/** The switcher's "back to the list" value; no Community id can equal it. */
const ALL = '__all';

/**
 * Communities (issue #3597, ADR 0018): the Communities the active Character
 * belongs to, with create, and an admin or Member view of the open one. A
 * Member is one Character, so switching Character switches the list. The open
 * Community rides in `?community=` so a reload or a shared tab lands on it.
 */
export function Communities() {
  const { t } = useTranslation();
  const hydrated = useActiveCharacter((s) => s.hydrated);
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const character = useLiveQuery(
    () => (characterId === null ? undefined : db.characters.get(characterId)),
    [characterId]
  );
  const [params, setParams] = useSearchParams();
  // Tagged with the Character it was loaded for, so switching Character reads
  // as "loading" until its own list lands, never the previous one's.
  const [loaded, setLoaded] = useState<{
    characterId: number;
    list: CommunitySummary[];
    /** The live read failed, so this is the last list read while online (`communityCache.ts`). */
    cached: boolean;
  } | null>(null);
  const communities = loaded && loaded.characterId === characterId ? loaded.list : null;
  const cached = loaded?.characterId === characterId && loaded.cached;
  // Tagged like `loaded`: one Character's failure is not another's.
  const [failedFor, setFailedFor] = useState<number | null>(null);
  const failed = failedFor === characterId;
  const [creating, setCreating] = useState(false);
  // On a phone the open Community stacks under the list, so a tap on a row
  // scrolls it into view rather than changing something off screen.
  const detailRef = useRef<HTMLDivElement>(null);
  const scrollToDetail = useRef(false);

  // Bumped after a change, to refetch the list.
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((n) => n + 1);
  // The connection coming back is a retry: the list was last read while offline.
  const reconnects = useReconnectCount();

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    (async () => {
      try {
        // Offline, the last list read answers (read-only); a refusal does not.
        const { value: list, cached } = await loadWithSnapshot({
          characterId,
          kind: 'list',
          live: () => loadMyCommunities(characterId),
        });
        if (!cached) {
          // Tells the Community alerts poll whether this Character has anything to watch.
          void rememberCommunityAdmin(characterId, list).catch(() => {});
          // And the nav badge's poll, whether it has any board to read.
          void rememberCommunityWatch(characterId, list).catch(() => {});
          // A Community the Character is no longer in leaves no roster behind.
          void pruneCommunitySnapshots(
            characterId,
            list.map((community) => community.id)
          );
        }
        if (cancelled) return;
        setLoaded({ characterId, list, cached });
        setFailedFor(null);
      } catch {
        if (!cancelled) setFailedFor(characterId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, reload, reconnects]);

  const openId = params.get('community');
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (!scrollToDetail.current) return;
    scrollToDetail.current = false;
    detailRef.current?.scrollIntoView?.({
      block: 'start',
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [openId, reduced]);

  // The old Invites tab's `?tab=invites` opens Manage › Invites once. Dropped
  // from the URL as soon as the Community is on screen, so a reload or a
  // Character switch does not open it again.
  const legacyInvites = params.get('tab') === INVITES_TAB_PARAM;
  const openShown = communities?.some((community) => community.id === openId) ?? false;
  useEffect(() => {
    if (!legacyInvites || !openShown) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tab');
        return next;
      },
      { replace: true }
    );
  }, [legacyInvites, openShown, setParams]);

  if (!hydrated) return <Spinner label={t('communities.loading')} />;
  if (characterId === null) return <Navigate to="/characters" replace />;

  const selectedId = params.get('community');
  const selected = communities?.find((community) => community.id === selectedId) ?? null;
  const tabParam = params.get('tab');
  const initialTab = COMMUNITY_TABS.find((tab) => tab === tabParam);
  const initialSharing = params.get('view') === MINE_VIEW_PARAM;
  const open = (id: string | null) => setParams(id ? { community: id } : {}, { replace: true });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={t('communities.title')}
        actions={
          // Primary only while it is the one thing to do; once in a Community it
          // steps back. Always md: level with the alerts bell beside it.
          <NeedsConnection>
            <Button
              variant={communities?.length === 0 ? 'primary' : 'ghost'}
              aria-label={t('communities.createLabel')}
              onClick={() => setCreating(true)}
            >
              {t('communities.create')}
            </Button>
          </NeedsConnection>
        }
      />
      {/* Inside a Community its own card says what it is; the intro is for the list. */}
      {!selected && <p className="text-xs text-text-dim">{t('communities.intro')}</p>}

      {cached && (
        <div className="flex flex-wrap items-center gap-2">
          <CachedNotice fetchedAt={null} />
          <Button size="sm" onClick={refresh}>
            {t('common.retry')}
          </Button>
        </div>
      )}
      {failed && selected && (
        <p role="alert" className="text-xs text-danger">
          {t('communities.loadFailed')}
        </p>
      )}
      {selected && communities ? (
        // Inside a Community the list steps back into a switcher: the open one
        // by name, the others a pick away, and "All Communities" for the list.
        communities.length > 1 && (
          <Select
            value={selected.id}
            onValueChange={(id) => {
              open(id === ALL ? null : id);
              scrollToDetail.current = id !== ALL && id !== selected.id;
            }}
          >
            <SelectTrigger aria-label={t('communities.switch')} className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {communities.map((community) => (
                <SelectItem key={community.id} value={community.id}>
                  {community.name}
                </SelectItem>
              ))}
              <SelectItem value={ALL}>{t('communities.allCommunities')}</SelectItem>
            </SelectContent>
          </Select>
        )
      ) : (
        <Panel title={t('communities.yourCommunities')}>
          {failed ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="min-w-0 flex-1 text-xs text-danger">
                {t('communities.loadFailed')}
              </p>
              <Button size="sm" onClick={refresh}>
                {t('common.retry')}
              </Button>
            </div>
          ) : communities === null ? (
            <Spinner label={t('communities.loading')} />
          ) : communities.length === 0 ? (
            <EmptyState title={t('communities.empty')} hint={t('communities.emptyHint')} />
          ) : (
            <ul className="divide-y divide-line">
              {communities.map((community) => (
                <li key={community.id}>
                  <button
                    type="button"
                    className={`group flex w-full items-center gap-2.5 px-1 py-1.5 text-left text-xs ${community.id === selected?.id ? selectedRowClassName : rowInteractiveClassName} ${tappableRowClassName} ${focusRingClassName} focus-visible:-outline-offset-2`}
                    aria-current={community.id === selected?.id ? 'true' : undefined}
                    onClick={() => {
                      scrollToDetail.current = community.id !== selected?.id;
                      open(community.id);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-xs border border-line bg-panel-2 text-[0.6875rem] font-semibold text-text-dim"
                    >
                      {communityInitials(community.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{community.name}</span>
                      <span className="block text-text-dim">
                        {t('communities.memberCount', { count: community.memberCount })}
                      </span>
                    </span>
                    {/* Only the exception is marked: every row is a Community the Character is a Member of. */}
                    {isCommunityAdmin(community, characterId) && (
                      <span className={communityBadgeClassName}>{t('communities.adminBadge')}</span>
                    )}
                    <RowCaret />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {selected && (
        <div ref={detailRef} className="scroll-mt-4">
          <CommunityDetail
            key={`${characterId}:${selected.id}`}
            community={selected}
            initialTab={initialTab}
            initialSharing={initialSharing}
            initialPanel={tabParam === INVITES_TAB_PARAM ? 'invites' : undefined}
            initialRequestId={params.get('request') ?? undefined}
            characterId={characterId}
            onChanged={() => refresh()}
            onPatch={(patch) =>
              setLoaded(
                (prev) =>
                  prev && {
                    ...prev,
                    list: prev.list.map((community) =>
                      community.id === selected.id ? { ...community, ...patch } : community
                    ),
                  }
              )
            }
            onGone={() => {
              open(null);
              refresh();
            }}
          />
        </div>
      )}

      <CreateCommunityDialog
        open={creating}
        characterId={characterId}
        characterName={character?.name ?? ''}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          open(id);
          refresh();
        }}
      />
    </div>
  );
}
