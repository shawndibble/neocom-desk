import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, EmptyState, PageHeader, Panel, Spinner } from '@/components/ui';
import { db } from '@/db';
import { CommunityDetail } from '@/features/communities/CommunityDetail';
import { CreateCommunityDialog } from '@/features/communities/CreateCommunityDialog';
import {
  isCommunityAdmin,
  loadMyCommunities,
  type CommunitySummary,
} from '@/features/communities/communityStore';
import { useActiveCharacter } from '@/stores/activeCharacter';

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
  } | null>(null);
  const communities = loaded && loaded.characterId === characterId ? loaded.list : null;
  // Tagged like `loaded`: one Character's failure is not another's.
  const [failedFor, setFailedFor] = useState<number | null>(null);
  const failed = failedFor === characterId;
  const [creating, setCreating] = useState(false);

  // Bumped after a change, to refetch the list.
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((n) => n + 1);

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await loadMyCommunities(characterId);
        if (cancelled) return;
        setLoaded({ characterId, list });
        setFailedFor(null);
      } catch {
        if (!cancelled) setFailedFor(characterId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, reload]);

  if (!hydrated) return <Spinner label={t('communities.loading')} />;
  if (characterId === null) return <Navigate to="/characters" replace />;

  const selectedId = params.get('community');
  const selected = communities?.find((community) => community.id === selectedId) ?? null;
  const open = (id: string | null) => setParams(id ? { community: id } : {}, { replace: true });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={t('communities.title')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('communities.create')}
          </Button>
        }
      />
      <p className="text-xs text-text-dim">{t('communities.intro')}</p>

      <Panel title={t('communities.yourCommunities')}>
        {failed ? (
          <p role="alert" className="text-xs text-danger">
            {t('communities.loadFailed')}
          </p>
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
                  className="flex w-full items-center gap-2 py-2 text-left text-xs hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  aria-current={community.id === selected?.id ? 'true' : undefined}
                  onClick={() => open(community.id)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{community.name}</span>
                  {isCommunityAdmin(community, characterId) && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-text-dim">
                      {t('communities.adminBadge')}
                    </span>
                  )}
                  <span className="text-text-dim">
                    {t('communities.memberCount', { count: community.memberCount })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {selected && (
        <CommunityDetail
          key={`${characterId}:${selected.id}`}
          community={selected}
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
