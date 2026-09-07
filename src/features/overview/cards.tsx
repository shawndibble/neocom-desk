/**
 * The Overview board's four domain cards and its alerts column.
 *
 * Each one is shaped by what its domain's volume actually does on a bad day —
 * see `BoardCard.tsx` for the rule. Every card renders *something* in every
 * state, including the boring one: a card that vanishes when a Character has
 * no colonies is a card you cannot tell from a card that failed to load.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Panel, SeverityIcon } from '@/components/ui';
import { worstSeverity, type BoardSeverity } from '@/engine/severity';
import { formatDuration } from '@/lib/duration';
import { formatIskCompact } from '@/lib/isk';
import { formatAge } from '@/lib/age';
import {
  activityI18nKey,
  isCompletingSoon,
  isJobDone,
  secondsRemaining,
  sortJobsBySoonest,
  summarizeJobs,
} from '@/features/industry/jobs';
import type { IndustryJob } from '@/esi/endpoints';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import { openOrderProblemCounts, needsAttentionCount } from '@/features/market/openOrdersModel';
import type { DisplayAlertGroup } from '@/features/notifications/alertsFilter';
import { BoardCard, NumberTile, TileRow, TriageRow } from './BoardCard';
import type { MiningTaxBoardData, PlanetaryBoardData } from './boardData';

/** How many rows a card shows before deferring to its own page. */
const ROW_LIMIT = 4;

// --- Open orders ----------------------------------------------------------

/**
 * Three counts, no rows.
 *
 * Twenty-one undercut orders is one fact, not twenty-one — and on the day it
 * is 137, a list would be the entire page. Which of them, and by how much, is
 * the Orders page's question; this card only says whether to go there.
 *
 * Counted off `problems` (the overlapping list) rather than `problem` (the
 * single worst): an order both undercut and about to expire genuinely needs
 * both done, and filing it under only the worse one would under-report the
 * relist pile. The header's "needs work" uses `needsAttentionCount`, which
 * counts each order once, so the two figures answer different questions
 * instead of disagreeing about one.
 *
 * The three undercut scopes are summed without fear of double-counting: an
 * order carries at most one of them, because `orderProblems.ts` derives them
 * from a single `undercutScope` field holding the *tightest* scope that beats
 * it. `belowFloor` is deliberately not subtracted — it is a different axis
 * (what the order costs you) rather than a fourth scope, an order can be both,
 * and subtracting it would remove sell orders below cost that nobody has
 * undercut at all.
 */
export function OrdersCard({ rows }: { rows: readonly OpenOrderRow[] }) {
  const { t } = useTranslation();
  const counts = openOrderProblemCounts(rows);
  const undercut = counts.undercutStation + counts.undercutSystem + counts.undercutRegion;
  const belowFloor = counts.belowFloor;

  return (
    <BoardCard
      title={t('overview.board.orders')}
      meta={
        <span className="text-[0.6875rem] text-text-dim">
          {t('overview.board.ordersMeta', { count: needsAttentionCount(rows) })}
        </span>
      }
      to="/market?section=orders"
      openLabel={t('overview.board.open')}
      footer={
        belowFloor > 0 ? (
          <span className="text-danger">
            {t('overview.board.belowFloor', { count: belowFloor })}
          </span>
        ) : (
          t('overview.board.noneBelowFloor')
        )
      }
    >
      <TileRow>
        <NumberTile label={t('overview.board.undercut')} value={undercut} severity="warning" />
        <NumberTile label={t('overview.board.outbid')} value={counts.outbid} severity="warning" />
        <NumberTile
          label={t('overview.board.relist')}
          value={counts.expiringOrStale}
          severity="watch"
        />
      </TileRow>
    </BoardCard>
  );
}

// --- Mining tax -----------------------------------------------------------

/**
 * Two counts: what is owed, and what has not been worked out yet.
 *
 * Only ever what *you* owe. The Moon Mining Tax ledger is built on your own
 * mining, so there is no "owed to you" side to report — an earlier draft had
 * one and it was meaningless.
 */
export function MiningTaxCard({ data }: { data: MiningTaxBoardData }) {
  const { t } = useTranslation();
  return (
    <BoardCard
      title={t('overview.board.miningTax')}
      to="/moon-mining"
      openLabel={t('overview.board.open')}
      footer={
        data.oldestUnpaidDays === null
          ? t('overview.board.miningSettled')
          : t('overview.board.miningFooter', {
              count: data.payeeCount,
              days: data.oldestUnpaidDays,
            })
      }
    >
      <TileRow>
        <NumberTile
          label={t('overview.board.iskUnpaid')}
          value={data.unpaidIsk === 0 ? 0 : formatIskCompact(data.unpaidIsk)}
          severity="warning"
        />
        <NumberTile
          label={t('overview.board.unassigned')}
          value={data.unassignedCount}
          severity="watch"
        />
      </TileRow>
    </BoardCard>
  );
}

// --- Planetary ------------------------------------------------------------

/**
 * One row per reset *run*, never per colony.
 *
 * PI is done in sittings, so a batch of planets shares an expiry and is one
 * trip. `groupColoniesIntoBatches` is where that judgement lives; this only
 * renders it.
 */
export function PlanetaryCard({ data }: { data: PlanetaryBoardData }) {
  const { t } = useTranslation();
  const batches = data.batches.slice(0, ROW_LIMIT);

  return (
    <BoardCard
      title={t('overview.board.planetary')}
      meta={<SeverityWord severity={worstSeverity(data.batches.map((b) => b.severity))} />}
      to="/planetary-industry"
      openLabel={t('overview.board.open')}
      footer={t('overview.board.planetaryFooter', {
        count: data.colonyCount,
        programs: data.programCount,
      })}
    >
      {batches.length === 0 ? (
        <CardEmpty>{t('overview.board.planetaryEmpty')}</CardEmpty>
      ) : (
        <ul>
          {batches.map((batch) => (
            <TriageRow
              key={`${batch.kind}:${batch.expiryMs ?? 'none'}`}
              severity={batch.severity}
              when={
                batch.kind === 'idle'
                  ? t('overview.board.noProgram')
                  : batch.kind === 'expired'
                    ? t('overview.board.stopped')
                    : formatDuration(Math.max(0, (batch.expiryMs ?? 0) - data.loadedAt) / 1000)
              }
              subject={t(`overview.board.batch.${batch.kind}`, { count: batch.colonies.length })}
              detail={batch.colonies
                .map((colony) => colony.name ?? `#${colony.planetId}`)
                .join(', ')}
              to="/planetary-industry"
            />
          ))}
        </ul>
      )}
    </BoardCard>
  );
}

// --- Industry -------------------------------------------------------------

/**
 * Real rows. Jobs are genuinely individual — different items, different
 * facilities, different clocks — so a count would throw away the only thing
 * that makes one worth acting on before another.
 *
 * Everything already finished collapses into one "ready to deliver" row: those
 * are interchangeable (they are all "go and click deliver"), and a dozen of
 * them would otherwise push every running job off the card.
 */
export function IndustryCard({
  jobs,
  productNames,
  nowMs,
}: {
  jobs: readonly IndustryJob[];
  productNames: ReadonlyMap<number, string>;
  nowMs: number;
}) {
  const { t } = useTranslation();
  const summary = summarizeJobs(jobs, nowMs);
  const running = sortJobsBySoonest(jobs.filter((job) => !isJobDone(job, nowMs)));
  const done = jobs.filter((job) => isJobDone(job, nowMs));
  const oldestDoneMs =
    done.length > 0 ? Math.min(...done.map((job) => Date.parse(job.end_date))) : null;
  const runningShown = running.slice(0, summary.done > 0 ? ROW_LIMIT - 1 : ROW_LIMIT);

  // The header is the worst of what is actually in the card, rows included —
  // otherwise a job landing in forty minutes reads `watch` in its row and
  // `clear` in the header directly above it.
  const severities: BoardSeverity[] = running.map((job) => jobSeverity(job, nowMs));
  if (summary.done > 0) severities.push('warning');

  return (
    <BoardCard
      title={t('overview.board.industry')}
      meta={<SeverityWord severity={worstSeverity(severities)} />}
      to="/industry"
      openLabel={t('overview.board.open')}
      footer={t('overview.board.industryFooter', {
        count: summary.running,
        more: Math.max(0, running.length - runningShown.length),
      })}
    >
      {jobs.length === 0 ? (
        <CardEmpty>{t('overview.board.industryEmpty')}</CardEmpty>
      ) : (
        <ul>
          {summary.done > 0 && (
            <TriageRow
              severity="warning"
              when={t('overview.board.ready')}
              subject={t('overview.board.jobsReady', { count: summary.done })}
              detail={
                oldestDoneMs === null
                  ? undefined
                  : t('overview.board.oldestFinished', {
                      age: formatDuration(Math.max(0, nowMs - oldestDoneMs) / 1000),
                    })
              }
              to="/industry"
            />
          )}
          {runningShown.map((job) => (
            <TriageRow
              key={job.job_id}
              severity={jobSeverity(job, nowMs)}
              when={formatDuration(secondsRemaining(job, nowMs))}
              subject={t('overview.board.jobSubject', {
                name: productNames.get(job.job_id) ?? t('overview.board.unknownProduct'),
                count: job.runs,
              })}
              detail={t(activityI18nKey(job.activity_id), { id: job.activity_id })}
              to="/industry"
            />
          ))}
        </ul>
      )}
    </BoardCard>
  );
}

/**
 * A running job's rung.
 *
 * Never worse than `watch`: it is doing exactly what it was told to, and only a
 * *finished* job is actually waiting on you. `isCompletingSoon` (the next hour)
 * is what separates "about to need collecting" from "running all week" — the
 * same threshold the Industry page's own rows highlight on.
 */
function jobSeverity(job: IndustryJob, nowMs: number): BoardSeverity {
  return isCompletingSoon(job, nowMs) ? 'watch' : 'clear';
}

// --- Alerts ---------------------------------------------------------------

/**
 * The column, not a card.
 *
 * Alerts are a different volume class from everything else on the board —
 * hundreds of fires across a dozen-odd types — so they get their own full-
 * height column, and a loud day never pushes the rest of the board around.
 * Rows are types with a count, the same grouping the Alerts page uses.
 */
export function AlertsColumn({
  groups,
  unread,
  onDismissAll,
}: {
  groups: readonly DisplayAlertGroup[];
  unread: number;
  onDismissAll: () => void;
}) {
  const { t } = useTranslation();
  const shown = groups.slice(0, 7);
  const hidden = groups.length - shown.length;

  return (
    <Panel
      className="flex h-full flex-col"
      title={t('overview.board.alerts')}
      meta={
        <span className="text-[0.6875rem] text-text-dim">
          {t('overview.board.alertsUnread', { count: unread })}
        </span>
      }
      actions={
        unread > 0 ? (
          <button
            type="button"
            onClick={onDismissAll}
            className="rounded-xs text-[0.6875rem] font-semibold tracking-widest text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t('overview.board.dismissAll')}
          </button>
        ) : undefined
      }
      padded={false}
    >
      <div className="flex flex-1 flex-col">
        {shown.length === 0 ? (
          <CardEmpty>{t('overview.board.alertsEmpty')}</CardEmpty>
        ) : (
          <ul className="flex-1">
            {shown.map((group) => (
              <AlertColumnRow key={group.key} group={group} />
            ))}
          </ul>
        )}
        <p className="mt-auto border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
          <Link to="/alerts" className="hover:text-accent hover:underline">
            {hidden > 0
              ? t('overview.board.alertsMore', { count: hidden })
              : t('overview.board.alertsOpen')}
          </Link>
        </p>
      </div>
    </Panel>
  );
}

function AlertColumnRow({ group }: { group: DisplayAlertGroup }) {
  const { t } = useTranslation();
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        to="/alerts"
        className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-9"
      >
        <span className="flex w-10 shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums">
          <SeverityIcon severity={group.severity} />
          {group.count}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{group.label}</span>
          <span className="block truncate text-[0.6875rem] text-text-dim">
            {t('alerts.newest', {
              // eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label
              age: formatAge(Math.max(0, Date.now() - group.newestFiredAt), t),
            })}
          </span>
        </span>
      </Link>
    </li>
  );
}

// --- Shared bits ----------------------------------------------------------

/**
 * The card header's one-word verdict.
 *
 * Text, not a coloured dot: "warning" has to survive a reader who cannot tell
 * the two border colours apart (DESIGN.md §7), and the word is shorter than
 * the tooltip explaining a dot would be.
 */
function SeverityWord({ severity }: { severity: BoardSeverity }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1 text-[0.6875rem] tracking-widest uppercase">
      <SeverityIcon severity={severity} />
      <span className="text-text-dim">{t(`corp.board.severity.${severity}`)}</span>
    </span>
  );
}

/**
 * A card with nothing in it still says what it checked. "No colonies" and "the
 * colonies read failed" must not look alike, and an empty card looks like the
 * second one.
 */
function CardEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-xs text-text-dim">{children}</p>;
}
