import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
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
import { loadContracts, isActiveContractStatus } from '@/features/character/contracts';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { useQuickbar } from '@/features/market/useQuickbar';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { NotificationFeedPanel } from '@/features/notifications/NotificationFeedPanel';
import { formatIsk } from '@/lib/isk';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { sortQueueEntries, selectActiveEntryFromSorted, selectQueueDepth } from './overviewQueue';

interface WalletPanelData {
  result: CachedResult<number> | null;
  needsReauth: boolean;
}

async function loadWalletPanel(characterId: number): Promise<WalletPanelData> {
  const { cached, needsReauth } = await loadWalletBalanceWithStatus(characterId);
  return { result: cached, needsReauth };
}

interface SkillsQueuePanelData {
  skillsResult: CachedResult<CharacterSkills> | null;
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  queueNeedsReauth: boolean;
  totalSp: number | null;
  catalog: SkillCatalog;
}

async function loadSkillsQueuePanel(characterId: number): Promise<SkillsQueuePanelData> {
  const [corrected, catalog] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadSkillCatalog(),
  ]);
  return {
    skillsResult: corrected.skillsResult,
    queueResult: corrected.queueResult,
    queueNeedsReauth: corrected.queueNeedsReauth,
    totalSp: corrected.totalSp,
    catalog,
  };
}

interface CountTileData {
  count: number | null;
  needsReauth: boolean;
}

async function loadIndustryTile(characterId: number): Promise<CountTileData> {
  const { cached, needsReauth } = await loadCharacterIndustryJobs(characterId);
  return { count: cached ? cached.data.length : null, needsReauth };
}

async function loadContractsTile(characterId: number): Promise<CountTileData> {
  const { cached, needsReauth } = await loadContracts(characterId);
  const count = cached ? cached.data.filter((c) => isActiveContractStatus(c.status)).length : null;
  return { count, needsReauth };
}

function SummaryTile({
  icon,
  label,
  to,
  count,
  needsReauth = false,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  count: number | null;
  needsReauth?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      aria-label={needsReauth ? t('overview.tileReauthLabel', { label }) : undefined}
      className="flex items-center gap-2 rounded-xs border border-line bg-panel/85 p-3 backdrop-blur-sm hover:border-line-bright"
    >
      <span aria-hidden="true" className="text-text-dim">
        {icon}
      </span>
      <span className="flex-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </span>
      <span
        className={`text-base font-medium tabular-nums ${needsReauth ? 'text-warning' : 'text-text'}`}
      >
        {needsReauth ? '—' : (count ?? '—')}
      </span>
    </Link>
  );
}

export function Overview() {
  const { t } = useTranslation();
  const walletSnapshot = useRouteSnapshot(loadWalletPanel);
  const skillsQueueSnapshot = useRouteSnapshot(loadSkillsQueuePanel);
  const industrySnapshot = useRouteSnapshot(loadIndustryTile);
  const contractsSnapshot = useRouteSnapshot(loadContractsTile);
  const { hydrated, activeCharacterId } = walletSnapshot;
  const quickbar = useQuickbar(activeCharacterId);

  const queueEntries = skillsQueueSnapshot.data?.queueResult?.data ?? null;
  // Sorted once per fetched queue rather than on every render (this component
  // re-renders on unrelated state, e.g. the notification feed) — the depth
  // and active-entry reads below both consume this same sort.
  const sortedQueue = useMemo(
    () => (queueEntries ? sortQueueEntries(queueEntries) : null),
    [queueEntries]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const walletData = walletSnapshot.data;
  const skillsQueueData = skillsQueueSnapshot.data;
  const queueResult = skillsQueueData?.queueResult ?? null;
  const catalog = skillsQueueData?.catalog ?? null;

  // Reads the wall clock to pick "the entry training right now" — unavoidably
  // impure, but it only affects which row is shown, not any cached value.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const now = Date.now();
  const activeEntry = sortedQueue ? selectActiveEntryFromSorted(sortedQueue, now) : null;
  const activeSkillName =
    activeEntry && catalog
      ? (catalog.bySkillTypeID.get(activeEntry.skill_id)?.name ?? `#${activeEntry.skill_id}`)
      : null;
  const queueDepth = sortedQueue ? selectQueueDepth(sortedQueue, now) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CharacterHeader
        characterId={activeCharacterId}
        totalSp={skillsQueueData?.totalSp ?? null}
        unallocatedSp={skillsQueueData?.skillsResult?.data?.unallocated_sp ?? null}
      />
      <OverviewSubNav />

      <Panel
        title={t('overview.wallet')}
        actions={
          <>
            {walletData?.result && <DataAgeBadge date={walletData.result.fetchedAt} />}
            <IconButton
              icon={<Icon.Refresh />}
              label={t('overview.refreshWallet')}
              onClick={walletSnapshot.refresh}
              disabled={walletSnapshot.loading}
            />
          </>
        }
      >
        {walletSnapshot.loading ? (
          <Spinner label={t('common.loading')} />
        ) : walletSnapshot.error ? (
          <EmptyState
            title={t('common.loadFailedTitle')}
            hint={t('common.loadFailedHint')}
            className="py-4"
          />
        ) : walletData?.needsReauth ? (
          <ReauthBanner
            title={t('overview.reauthTitle')}
            hint={t('overview.reauthHint')}
            actionLabel={t('overview.reauthAction')}
            onLogin={() => void beginEveLogin()}
          />
        ) : walletData?.result ? (
          <Link
            to="/wallet"
            className="inline-block text-lg font-medium tabular-nums text-isk-pos hover:underline"
          >
            {formatIsk(walletData.result.data, 2)} {t('overview.isk')}
          </Link>
        ) : (
          <EmptyState title={t('overview.walletEmpty')} className="py-4" />
        )}
        {walletData?.result?.fromCache && (
          <p className="mt-1 text-[0.6875rem] text-warning uppercase">{t('skills.offlineTitle')}</p>
        )}
      </Panel>

      <div aria-live="polite">
        <Panel
          title={t('overview.queue')}
          actions={
            <>
              {queueResult && <DataAgeBadge date={queueResult.fetchedAt} />}
              <IconButton
                icon={<Icon.Refresh />}
                label={t('overview.refreshQueue')}
                onClick={skillsQueueSnapshot.refresh}
                disabled={skillsQueueSnapshot.loading}
              />
            </>
          }
        >
          {skillsQueueSnapshot.loading ? (
            <Spinner label={t('common.loading')} />
          ) : skillsQueueSnapshot.error ? (
            <EmptyState
              title={t('common.loadFailedTitle')}
              hint={t('common.loadFailedHint')}
              className="py-4"
            />
          ) : skillsQueueData?.queueNeedsReauth ? (
            <ReauthBanner
              title={t('overview.queueReauthTitle')}
              hint={t('overview.queueReauthHint')}
              actionLabel={t('overview.queueReauthAction')}
              onLogin={() => void beginEveLogin()}
            />
          ) : !queueResult || queueDepth?.status === 'empty' ? (
            <EmptyState title={t('overview.queueEmpty')} className="py-4" />
          ) : queueDepth?.status === 'paused' ? (
            <EmptyState title={t('overview.queuePaused')} className="py-4" />
          ) : (
            <div className="space-y-1">
              <Link to="/skills/plans" className="block text-sm hover:text-accent">
                {activeSkillName
                  ? t('overview.training', { name: activeSkillName })
                  : t('overview.queueScheduled')}
                {activeEntry?.finish_date && (
                  <span className="ml-2 text-xs text-text-dim">
                    {t('overview.finishes', {
                      date: new Date(activeEntry.finish_date).toLocaleString(),
                    })}{' '}
                    ·{' '}
                    {t('overview.timeLeft', {
                      duration: formatDuration((Date.parse(activeEntry.finish_date) - now) / 1000),
                    })}
                  </span>
                )}
              </Link>
              {queueDepth && (
                <p className="text-xs text-text-dim">
                  {t('overview.queueDepth', {
                    count: queueDepth.count,
                    total: formatDuration(queueDepth.totalRemainingSeconds),
                    date: queueDepth.finalFinishDate
                      ? new Date(queueDepth.finalFinishDate).toLocaleDateString()
                      : '—',
                  })}
                </p>
              )}
            </div>
          )}
          {queueResult?.fromCache && (
            <p className="mt-1 text-[0.6875rem] text-warning uppercase">
              {t('skills.offlineTitle')}
            </p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={<Icon.Industry size={Icon.ICON_SIZE.md} />}
          label={t('overview.industryTile')}
          to="/industry"
          count={industrySnapshot.data?.count ?? null}
          needsReauth={industrySnapshot.data?.needsReauth ?? false}
        />
        <SummaryTile
          icon={<Icon.Market size={Icon.ICON_SIZE.md} />}
          label={t('overview.marketTile')}
          to="/market"
          count={quickbar.items.length}
        />
        <SummaryTile
          icon={<Icon.Contracts size={Icon.ICON_SIZE.md} />}
          label={t('overview.contractsTile')}
          to="/contracts"
          count={contractsSnapshot.data?.count ?? null}
          needsReauth={contractsSnapshot.data?.needsReauth ?? false}
        />
      </div>

      {/* Independent of the panels' loading/error states: device-local data, no ESI dependency. */}
      <NotificationFeedPanel />
    </div>
  );
}
