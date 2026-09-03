import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  EmptyState,
  IconButton,
  Panel,
  ReauthBanner,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import type { CachedResult } from '@/features/skills/data';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadWalletBalanceWithStatus } from '@/features/character/wallet';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { CharacterHeader } from '@/features/character/CharacterHeader';
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
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadOverviewSnapshot);

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
      <CharacterHeader
        characterId={activeCharacterId}
        totalSp={totalSp}
        unallocatedSp={skillsResult?.data?.unallocated_sp ?? null}
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('overview.refresh')}
            onClick={refresh}
            disabled={loading}
          />
        }
      />
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

          {/*
            Below the queue: the feed grows with however many event types are
            enabled, so it sits under the two fixed-height panels rather than
            pushing them off the first screen.
          */}
          <NotificationFeedPanel />
        </>
      )}
    </div>
  );
}
