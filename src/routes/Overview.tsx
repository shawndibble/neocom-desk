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
import { rememberSpSummary, getLastKnownSpSummary } from '@/stores/characterSp';
import { loadWalletBalanceWithStatus } from '@/features/character/wallet';
import { loadContracts, isActiveContractStatus } from '@/features/character/contracts';
import { loadOrders } from '@/features/character/orders';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { maxMarketOrders } from '@/engine/market/orderSlots';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
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
  /**
   * Open-order ceiling for the Open Orders tile. Derived here rather than in
   * its own snapshot: the Trade-group skill levels it needs are already in
   * this load's corrected skills, so it costs no extra ESI read. Null until
   * /skills has landed — an untrained character still has slots, so "5" and
   * "not loaded yet" must not look alike.
   */
  maxOrders: number | null;
}

async function loadSkillsQueuePanel(characterId: number): Promise<SkillsQueuePanelData> {
  const [corrected, catalog] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadSkillCatalog(),
  ]);
  // Feeds the same cache `characterSp.ts` keeps for Clones/Employment History,
  // so switching to either of those tabs can seed the shared header from
  // Overview's own read instead of blanking it while its own load is in
  // flight — this view already has both numbers without a second /skills
  // call, so cost is zero.
  rememberSpSummary(characterId, {
    totalSp: corrected.totalSp,
    unallocatedSp: corrected.skillsResult?.data.unallocated_sp ?? null,
  });
  return {
    skillsResult: corrected.skillsResult,
    queueResult: corrected.queueResult,
    queueNeedsReauth: corrected.queueNeedsReauth,
    totalSp: corrected.totalSp,
    catalog,
    maxOrders: corrected.skillsResult ? maxMarketOrders(corrected.trained) : null,
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

async function loadOrdersTile(characterId: number): Promise<CountTileData> {
  const { cached, needsReauth } = await loadOrders(characterId);
  return { count: cached ? cached.data.length : null, needsReauth };
}

function SummaryTile({
  icon,
  label,
  to,
  count,
  total,
  needsReauth = false,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  count: number | null;
  /**
   * Optional ceiling, rendered as `count / total`. Passed separately because
   * it comes from a different snapshot than `count` — an unloaded ceiling
   * must not blank out a count that did load.
   */
  total?: number | null;
  needsReauth?: boolean;
}) {
  const { t } = useTranslation();
  const shown = needsReauth ? '—' : (count ?? '—');
  // "12 / 305" reads as a slash to a screen reader, so the ratio tiles carry
  // the same figure spelled out.
  const ratioLabel =
    total === undefined || needsReauth
      ? undefined
      : t('overview.tileRatioLabel', { label, used: shown, total: total ?? '—' });
  return (
    <Link
      to={to}
      aria-label={needsReauth ? t('overview.tileReauthLabel', { label }) : ratioLabel}
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
        {shown}
        {total !== undefined && !needsReauth && (
          <span className="text-text-dim"> / {total ?? '—'}</span>
        )}
      </span>
    </Link>
  );
}

export function Overview() {
  const { t } = useTranslation();
  // One `cacheKey` per panel, not one for the page: they load independently,
  // so a return visit should restore each as soon as that panel's own last
  // result exists.
  const walletSnapshot = useRouteSnapshot(loadWalletPanel, undefined, {
    cacheKey: 'overview:wallet',
  });
  const skillsQueueSnapshot = useRouteSnapshot(loadSkillsQueuePanel, undefined, {
    cacheKey: 'overview:skill-queue',
  });
  const industrySnapshot = useRouteSnapshot(loadIndustryTile, undefined, {
    cacheKey: 'overview:industry',
  });
  const contractsSnapshot = useRouteSnapshot(loadContractsTile, undefined, {
    cacheKey: 'overview:contracts',
  });
  const ordersSnapshot = useRouteSnapshot(loadOrdersTile, undefined, {
    cacheKey: 'overview:orders',
  });
  const { hydrated, activeCharacterId } = walletSnapshot;

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
  // Looked up once, not once per field: both chips fall back to the same
  // character's cached SP pair while this tab's own load is in flight.
  const lastKnownSp = getLastKnownSpSummary(activeCharacterId);

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
        totalSp={skillsQueueData?.totalSp ?? lastKnownSp.totalSp}
        unallocatedSp={
          skillsQueueData?.skillsResult?.data?.unallocated_sp ?? lastKnownSp.unallocatedSp
        }
      />
      <OverviewSubNav />

      {/* Wallet and training queue share a row on desktop, stack on mobile.
          The aria-live region stays on the queue alone — hoisting it to the
          grid would start announcing wallet balance changes too.

          Deliberately no `items-start`: the grid's default `stretch` is what
          gives the two panels a common bottom edge side by side, and a pair of
          cards at different heights reads as one of them having failed to
          load. Stacked it changes nothing — a single-column row is as tall as
          its only item either way. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* The balance is one line against the queue's three, so equal heights
            leave it stranded at the top of a tall card. Centring is the whole
            reason for the flex chain here, and it takes every link: the section
            has to be a column (`flex flex-col`) for `fill` to have room to
            claim, `fill` makes the content wrapper the growing child rather
            than a plain block, and only then can the inner box centre what it
            holds. Drop any one and the balance goes back to the top. */}
        <Panel
          className="flex flex-col"
          fill
          title={t('overview.wallet')}
          actions={
            <>
              {walletData?.result && <DataAgeBadge date={walletData.result.fetchedAt} />}
              <IconButton
                size="sm"
                icon={<Icon.Refresh />}
                label={t('overview.refreshWallet')}
                onClick={walletSnapshot.refresh}
                disabled={walletSnapshot.loading}
              />
            </>
          }
        >
          <div className="flex flex-1 flex-col justify-center">
            {walletSnapshot.loading && !walletData ? (
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
              // `inline-block` would stretch the link across the centred
              // column and put its underline under the whitespace too;
              // `self-start` keeps the hit area on the digits.
              <Link
                to="/wallet"
                className="self-start text-lg font-medium tabular-nums text-isk-pos hover:underline"
              >
                {formatIsk(walletData.result.data, 2)} {t('overview.isk')}
              </Link>
            ) : (
              <EmptyState title={t('overview.walletEmpty')} className="py-4" />
            )}
            {walletData?.result?.fromCache && (
              <p className="mt-1 text-[0.6875rem] text-warning uppercase">
                {t('skills.offlineTitle')}
              </p>
            )}
          </div>
        </Panel>

        {/* `h-full` twice, and both are load-bearing. The grid stretches this
            wrapper, not the Panel inside it, so without the pair the queue card
            would sit at its content height inside a full-height box and the
            row's bottom edges would still disagree. The wallet Panel is a grid
            child directly, so it needs neither. */}
        <div aria-live="polite" className="h-full">
          <Panel
            className="h-full"
            title={t('overview.queue')}
            actions={
              <>
                {queueResult && <DataAgeBadge date={queueResult.fetchedAt} />}
                <IconButton
                  size="sm"
                  icon={<Icon.Refresh />}
                  label={t('overview.refreshQueue')}
                  onClick={skillsQueueSnapshot.refresh}
                  disabled={skillsQueueSnapshot.loading}
                />
              </>
            }
          >
            {skillsQueueSnapshot.loading && !skillsQueueData ? (
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
                        date: formatTimestamp(new Date(activeEntry.finish_date)),
                      })}{' '}
                      ·{' '}
                      {t('overview.timeLeft', {
                        duration: formatDuration(
                          (Date.parse(activeEntry.finish_date) - now) / 1000
                        ),
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
          label={t('overview.ordersTile')}
          to="/market?section=orders"
          count={ordersSnapshot.data?.count ?? null}
          total={skillsQueueData?.maxOrders ?? null}
          needsReauth={ordersSnapshot.data?.needsReauth ?? false}
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
