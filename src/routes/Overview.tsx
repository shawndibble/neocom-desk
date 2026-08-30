import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  CharacterAvatar,
  DataAgeBadge,
  EmptyState,
  Panel,
  ReauthBanner,
  Spinner,
  StatChip,
} from '@/components/ui';
import { usePublicInfo } from '@/stores/publicInfo';
import { beginEveLogin } from '@/app/loginFlow';
import {
  loadCharacterSkills,
  loadCharacterSkillQueue,
  type CachedResult,
} from '@/features/skills/data';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { loadWalletBalanceWithStatus } from '@/features/character/wallet';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { selectActiveQueueEntry } from './overviewQueue';

interface Snapshot {
  walletResult: CachedResult<number> | null;
  walletNeedsReauth: boolean;
  skillsResult: CachedResult<CharacterSkills> | null;
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  catalog: SkillCatalog;
}

async function loadOverviewSnapshot(characterId: number): Promise<Snapshot> {
  // Fire-and-forget: the header reads corp/alliance from the store as they
  // arrive, so the panels below must not wait on that chain of public fetches.
  void usePublicInfo.getState().load(characterId);
  const [wallet, skillsResult, queueResult, catalog] = await Promise.all([
    loadWalletBalanceWithStatus(characterId),
    loadCharacterSkills(characterId),
    loadCharacterSkillQueue(characterId),
    loadSkillCatalog(),
  ]);
  return {
    walletResult: wallet.cached,
    walletNeedsReauth: wallet.needsReauth,
    skillsResult,
    queueResult,
    catalog,
  };
}

/** Dashboard for the active character: identity, SP, wallet, training queue snippet. */
export function Overview() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId } =
    useRouteSnapshot(loadOverviewSnapshot);
  const character = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  );
  const publicInfo = usePublicInfo((state) =>
    activeCharacterId === null ? undefined : state.byCharacterId[activeCharacterId]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const walletResult = data?.walletResult ?? null;
  const walletNeedsReauth = data?.walletNeedsReauth ?? false;
  const skillsResult = data?.skillsResult ?? null;
  const queueResult = data?.queueResult ?? null;
  const catalog = data?.catalog ?? null;

  // Reads the wall clock to pick "the entry training right now" — unavoidably
  // impure, but it only affects which row is shown, not any cached value.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const activeEntry = queueResult ? selectActiveQueueEntry(queueResult.data, Date.now()) : null;
  const activeSkillName =
    activeEntry && catalog
      ? (catalog.bySkillTypeID.get(activeEntry.skill_id)?.name ?? `#${activeEntry.skill_id}`)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <CharacterAvatar
          characterId={activeCharacterId}
          size="lg"
          alt={t('characters.portraitAlt', { name: character?.name ?? '' })}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-widest uppercase">
            {character?.name ?? t('common.unknown')}
          </h1>
          <p className="truncate text-xs text-text-dim">
            {publicInfo?.corporationName ?? t('common.unknown')}
            {publicInfo?.allianceName ? ` / ${publicInfo.allianceName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip
            label={t('skills.totalSp')}
            value={
              skillsResult?.data ? skillsResult.data.total_sp.toLocaleString() : t('common.unknown')
            }
          />
          <StatChip
            label={t('skills.unallocatedSp')}
            value={
              skillsResult?.data?.unallocated_sp !== undefined
                ? skillsResult.data.unallocated_sp.toLocaleString()
                : t('common.unknown')
            }
          />
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : (
        <>
          <Panel
            title={t('overview.wallet')}
            actions={walletResult ? <DataAgeBadge date={walletResult.fetchedAt} /> : undefined}
          >
            {walletResult ? (
              <p className="text-lg font-medium tabular-nums text-isk-pos">
                {formatIsk(walletResult.data, 2)} {t('overview.isk')}
              </p>
            ) : walletNeedsReauth ? (
              <ReauthBanner
                title={t('overview.reauthTitle')}
                hint={t('overview.reauthHint')}
                actionLabel={t('overview.reauthAction')}
                onLogin={() => void beginEveLogin()}
              />
            ) : (
              <EmptyState title={t('overview.walletEmpty')} className="py-4" />
            )}
            {walletResult?.fromCache && (
              <p className="mt-1 text-[0.6875rem] text-warning uppercase">
                {t('skills.offlineTitle')}
              </p>
            )}
          </Panel>

          <Panel
            title={t('overview.queue')}
            actions={queueResult ? <DataAgeBadge date={queueResult.fetchedAt} /> : undefined}
          >
            {activeSkillName ? (
              <p className="text-sm">
                {t('overview.training', { name: activeSkillName })}
                {activeEntry?.finish_date && (
                  <span className="ml-2 text-xs text-text-dim">
                    {t('overview.finishes', {
                      date: new Date(activeEntry.finish_date).toLocaleString(),
                    })}
                  </span>
                )}
              </p>
            ) : (
              <EmptyState title={t('overview.queueEmpty')} className="py-4" />
            )}
            {queueResult?.fromCache && (
              <p className="mt-1 text-[0.6875rem] text-warning uppercase">
                {t('skills.offlineTitle')}
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
