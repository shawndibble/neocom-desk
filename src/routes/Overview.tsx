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
import type { CachedResult } from '@/features/skills/data';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadWalletBalanceWithStatus } from '@/features/character/wallet';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { NotificationFeedPanel } from '@/features/notifications/NotificationFeedPanel';
import { formatIsk } from '@/lib/isk';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { selectActiveQueueEntry } from './overviewQueue';

interface Snapshot {
  walletResult: CachedResult<number> | null;
  walletNeedsReauth: boolean;
  skillsResult: CachedResult<CharacterSkills> | null;
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  /** ESI's total_sp corrected for queue entries /skills has not caught up to. */
  totalSp: number | null;
  /** 401/403 on the queue read means "log in again", not "queue is empty". */
  queueNeedsReauth: boolean;
  catalog: SkillCatalog;
}

async function loadOverviewSnapshot(characterId: number): Promise<Snapshot> {
  // Fire-and-forget: the header reads corp/alliance from the store as they
  // arrive, so the panels below must not wait on that chain of public fetches.
  void usePublicInfo.getState().load(characterId);
  const [wallet, corrected, catalog] = await Promise.all([
    loadWalletBalanceWithStatus(characterId),
    loadCorrectedSkills(characterId, Date.now()),
    loadSkillCatalog(),
  ]);
  return {
    walletResult: wallet.cached,
    walletNeedsReauth: wallet.needsReauth,
    skillsResult: corrected.skillsResult,
    queueResult: corrected.queueResult,
    queueNeedsReauth: corrected.queueNeedsReauth,
    totalSp: corrected.totalSp,
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
  const queueNeedsReauth = data?.queueNeedsReauth ?? false;
  const totalSp = data?.totalSp ?? null;
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
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <CharacterAvatar
          characterId={activeCharacterId}
          size="lg"
          alt={t('characters.portraitAlt', { name: character?.name ?? '' })}
        />
        {/*
          `basis-48` is what makes the header actually wrap on a phone. With a
          bare `flex-1` (basis 0) this block is infinitely shrinkable, so the
          chips below stayed on line one and truncated the character name down
          to a single letter instead. Given a real basis, the chips wrap to
          their own line and the name gets the full width.
        */}
        <div className="min-w-0 flex-1 basis-48">
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
            value={totalSp !== null ? totalSp.toLocaleString() : t('common.unknown')}
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
      <OverviewSubNav />

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
            {queueNeedsReauth ? (
              <ReauthBanner
                title={t('overview.queueReauthTitle')}
                hint={t('overview.queueReauthHint')}
                actionLabel={t('overview.queueReauthAction')}
                onLogin={() => void beginEveLogin()}
              />
            ) : activeSkillName ? (
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

      {/*
        Below the queue, and deliberately outside the loading/error branch
        above: the feed is device-local Dexie data with no ESI dependency, and
        a failed or still-loading snapshot is exactly when someone wants to
        see what they missed. CONTEXT.md round 4 asks Overview to degrade per
        panel rather than gating the whole page.
      */}
      <NotificationFeedPanel />
    </div>
  );
}
