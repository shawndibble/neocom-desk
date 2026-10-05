/**
 * The Overview board's domain cards and its alerts column.
 *
 * Each one is shaped by what its domain's volume actually does on a bad day —
 * see `BoardCard.tsx` for the rule. Every card renders *something* in every
 * state, including the boring one: a card that vanishes when a Character has
 * no colonies is a card you cannot tell from a card that failed to load.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  IskAmount,
  Panel,
  SEVERITY_LABEL,
  SeverityIcon,
  textActionClassName,
} from '@/components/ui';
import type { DeadlineSeverity } from '@/engine/severity';
import { formatDuration } from '@/lib/duration';
import { formatAge } from '@/lib/age';
import {
  activityI18nKey,
  isJobDone,
  secondsRemaining,
  sortJobsBySoonest,
  summarizeJobs,
} from '@/features/industry/jobs';
import type { IndustryJob } from '@/esi/endpoints';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import { openOrderProblemCounts, needsAttentionCount } from '@/features/market/openOrdersModel';
import { openOrdersHref } from '@/features/market/openOrdersFilter';
import { UNDERCUT_PROBLEMS, type OrderProblem } from '@/engine/market/orderProblems';
import type { DisplayAlertGroup } from '@/features/notifications/alertsFilter';
import { BoardCard, FoldedRow, NumberTile, TileRow, TriageRow } from './BoardCard';
import {
  industrySeverity,
  jobSeverity,
  comingUpEventSeverity,
  comingUpSeverity,
  priceAlertsSeverity,
  mailSeverity,
  spExtractionSeverity,
  contractsSeverity,
  miningTaxSeverity,
  planetarySeverity,
} from './boardSeverity';
import { contractsDeadlineNote, mailSummary } from './boardSummary';
import { upcomingCommittedEvents } from '@/engine/calendarDeadline';
import { extractableSp, extractorCount } from '@/engine/spExtraction';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIskCompact } from '@/lib/isk';
import type { CorpBoardItem } from '@/engine/corp/board';
import { structureStateLabel } from '@/features/corp/boardSources';
import {
  moonChunkSeverity,
  moonChunksSeverity,
  structureCounts,
  structuresSeverity,
} from './corpCards';
import type {
  CalendarEventsBoardData,
  ContractsBoardData,
  MailBoardData,
  MiningTaxBoardData,
  MoonChunksBoardData,
  PlanetaryBoardData,
  PriceAlertsBoardData,
  SpExtractionBoardData,
  StructuresView,
} from './boardData';

/** The Contracts History table filtered to accepted contracts — the courier hauls the card counts. */
export const CONTRACTS_IN_PROGRESS_HREF = '/contracts/history?history.status=in_progress';

/** How many rows a card shows before deferring to its own page. */
const ROW_LIMIT = 4;

/**
 * What a tile shows when the question cannot be answered at all — a lapsed
 * grant, not a zero.
 *
 * This is the one place the zero rule needs a companion. "0 undercut" in plain
 * text means "checked, nothing to do"; printing it for a read that never
 * happened would make a broken card the most reassuring thing on the board.
 */
const UNKNOWN = '—';

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
export function OrdersCard({
  rows,
  characterId,
  maxOrders,
  needsReauth,
}: {
  rows: readonly OpenOrderRow[];
  /** Whose orders these are. Carried into each tile's link so the page it opens counts the same ones. */
  characterId: number;
  /** The ceiling the Trade skills grant. Null until /skills lands — an untrained pilot still has slots, so "5" and "not known yet" must not look alike. */
  maxOrders: number | null;
  needsReauth: boolean;
}) {
  const { t } = useTranslation();
  const counts = openOrderProblemCounts(rows);
  const undercut = counts.undercutStation + counts.undercutSystem + counts.undercutRegion;
  const belowFloor = counts.belowFloor;
  // Each tile opens the Orders page filtered to exactly the rows it counted —
  // including the character, because this card is one pilot's and that page is
  // every pilot's. The header's own link stays the unfiltered page, the way
  // every other card's does.
  const href = (problems: readonly OrderProblem[]) =>
    openOrdersHref({ problems, characterIds: [characterId] });

  return (
    <BoardCard
      title={t('overview.board.orders')}
      meta={
        needsReauth ? undefined : (
          <span className="text-[0.6875rem] text-text-dim">
            {t('overview.board.ordersMeta', { count: needsAttentionCount(rows) })}
          </span>
        )
      }
      to="/market/orders"
      help={t('overview.board.ordersHelp')}
      openLabel={t('overview.board.open')}
      footer={
        needsReauth ? (
          t('overview.board.reauth')
        ) : (
          <>
            {belowFloor > 0 ? (
              <span className="text-danger">
                {t('overview.board.belowFloor', { count: belowFloor })}
              </span>
            ) : (
              t('overview.board.noneBelowFloor')
            )}
            {maxOrders !== null &&
              ` · ${t('overview.board.slotsUsed', { used: rows.length, total: maxOrders })}`}
          </>
        )
      }
    >
      <TileRow>
        <NumberTile
          label={t('overview.board.undercut')}
          value={needsReauth ? UNKNOWN : undercut}
          severity="warning"
          to={href(UNDERCUT_PROBLEMS)}
        />
        <NumberTile
          label={t('overview.board.outbid')}
          value={needsReauth ? UNKNOWN : counts.outbid}
          severity="warning"
          to={href(['outbid'])}
        />
        <NumberTile
          label={t('overview.board.relist')}
          value={needsReauth ? UNKNOWN : counts.expiringOrStale}
          severity="watch"
          to={href(['expiringOrStale'])}
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
export function MiningTaxCard({ data }: { data: MiningTaxBoardData | null }) {
  const { t } = useTranslation();
  return (
    <BoardCard
      title={t('overview.board.miningTax')}
      meta={
        <SeverityWord
          severity={miningTaxSeverity(data)}
          warningLabel={data?.needsReauth ? REAUTH_WORD : 'overview.board.word.unpaid'}
        />
      }
      to="/mining/tax"
      help={t('overview.board.miningTaxHelp')}
      openLabel={t('overview.board.open')}
      footer={
        data === null
          ? t('overview.board.checking')
          : data.needsReauth
            ? t('overview.board.reauth')
            : data.oldestUnpaidDays === null || data.payeeCount === 0
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
          value={
            data?.needsReauth ? (
              UNKNOWN
            ) : data === null || data.unpaidIsk === 0 ? (
              0
            ) : (
              <IskAmount value={data.unpaidIsk} decimals={0} />
            )
          }
          severity="warning"
        />
        <NumberTile
          label={t('overview.board.unassigned')}
          value={data?.needsReauth ? UNKNOWN : (data?.unassignedCount ?? 0)}
          severity="watch"
        />
      </TileRow>
    </BoardCard>
  );
}

// --- Contracts ------------------------------------------------------------

/**
 * Only the contracts on a clock: accepted couriers, and the pilot's own
 * listings in their last day. Everything longer-dated is deliberately absent —
 * see `engine/contractsBoard`.
 */
export function ContractsCard({ data }: { data: ContractsBoardData | null }) {
  const { t } = useTranslation();
  const note = data === null || data.needsReauth ? null : contractsDeadlineNote(t, data);
  return (
    <BoardCard
      title={t('overview.board.contracts')}
      meta={
        <SeverityWord
          severity={contractsSeverity(data)}
          warningLabel={data?.needsReauth ? REAUTH_WORD : undefined}
        />
      }
      to={CONTRACTS_IN_PROGRESS_HREF}
      openLabel={t('overview.board.open')}
      footer={
        data === null
          ? t('overview.board.checking')
          : data.needsReauth
            ? t('overview.board.reauth')
            : (note ?? t('overview.board.contractsNothingDue'))
      }
    >
      <TileRow>
        <NumberTile
          label={t('overview.board.contractsInProgressTile')}
          value={data?.needsReauth ? UNKNOWN : (data?.summary.inProgress ?? 0)}
          severity="watch"
        />
        <NumberTile
          label={t('overview.board.contractsDueTile')}
          value={data?.needsReauth ? UNKNOWN : (data?.summary.dueSoon ?? 0)}
          severity={data && data.summary.overdue > 0 ? 'critical' : 'warning'}
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
export function PlanetaryCard({ data }: { data: PlanetaryBoardData | null }) {
  const { t } = useTranslation();
  const batches = data?.batches.slice(0, ROW_LIMIT) ?? [];

  return (
    <BoardCard
      title={t('overview.board.planetary')}
      meta={
        <SeverityWord
          severity={planetarySeverity(data)}
          warningLabel={data?.needsReauth ? REAUTH_WORD : undefined}
        />
      }
      to="/planetary-industry"
      help={t('overview.board.planetaryHelp')}
      openLabel={t('overview.board.open')}
      footer={
        data === null
          ? t('overview.board.checking')
          : data.needsReauth
            ? t('overview.board.reauth')
            : // Two counts, so two keys: i18next inflects one `count` per
              // lookup, and "1 colony · 1 extractor programs" is what asking it
              // to do both at once produces.
              `${t('overview.board.colonyCount', { count: data.colonyCount })} · ${t(
                'overview.board.programCount',
                { count: data.programCount }
              )}`
      }
    >
      {batches.length === 0 ? (
        <CardEmpty>
          {data === null
            ? t('overview.board.checking')
            : data.needsReauth
              ? t('overview.board.reauth')
              : t('overview.board.planetaryEmpty')}
        </CardEmpty>
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
                    : formatDuration(
                        Math.max(0, (batch.expiryMs ?? 0) - (data?.loadedAt ?? 0)) / 1000
                      )
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
  needsReauth,
  nowMs,
}: {
  jobs: readonly IndustryJob[];
  productNames: ReadonlyMap<number, string>;
  /** A lapsed grant, not an idle character — an empty card must not conflate the two. */
  needsReauth: boolean;
  nowMs: number;
}) {
  const { t } = useTranslation();
  const summary = summarizeJobs(jobs, nowMs);
  const running = sortJobsBySoonest(jobs.filter((job) => !isJobDone(job, nowMs)));
  const done = jobs.filter((job) => isJobDone(job, nowMs));
  const oldestDoneMs =
    done.length > 0 ? Math.min(...done.map((job) => Date.parse(job.end_date))) : null;
  const runningShown = running.slice(0, summary.done > 0 ? ROW_LIMIT - 1 : ROW_LIMIT);

  return (
    <BoardCard
      title={t('overview.board.industry')}
      meta={
        <SeverityWord
          severity={industrySeverity(jobs, needsReauth, nowMs)}
          warningLabel={needsReauth ? REAUTH_WORD : 'overview.board.word.ready'}
        />
      }
      to="/industry"
      openLabel={t('overview.board.open')}
      footer={(() => {
        const hidden = Math.max(0, running.length - runningShown.length);
        if (summary.running === 0) return t('overview.board.industryIdle');
        return hidden === 0
          ? t('overview.board.industryRunning', { count: summary.running })
          : t('overview.board.industryFooter', { count: summary.running, more: hidden });
      })()}
    >
      {jobs.length === 0 ? (
        <CardEmpty>
          {needsReauth ? t('overview.board.reauth') : t('overview.board.industryEmpty')}
        </CardEmpty>
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

// --- Coming up ------------------------------------------------------------

/**
 * The next few calendar events the pilot said yes (or maybe) to.
 *
 * Only committed events, and only the calendar. The Calendar page's Coming Up
 * rail also carries jobs, colonies and contracts, but each of those already
 * has a card here, and a second row for the same clock would be a number the
 * board could contradict.
 */
export function ComingUpCard({
  data,
  nowMs,
}: {
  data: CalendarEventsBoardData | null;
  nowMs: number;
}) {
  const { t } = useTranslation();
  const upcoming = data ? upcomingCommittedEvents(data.events, nowMs) : [];
  const shown = upcoming.slice(0, ROW_LIMIT);
  return (
    <BoardCard
      title={t('overview.board.comingUp')}
      meta={
        <SeverityWord
          severity={comingUpSeverity(data, nowMs)}
          warningLabel={data?.needsReauth ? REAUTH_WORD : undefined}
        />
      }
      to="/calendar"
      openLabel={t('overview.board.open')}
      footer={
        data === null
          ? t('overview.board.checking')
          : data.needsReauth
            ? t('overview.board.reauth')
            : t('overview.board.comingUpFooter', { count: upcoming.length })
      }
    >
      {shown.length === 0 ? (
        <CardEmpty>
          {data === null
            ? t('overview.board.checking')
            : data.needsReauth
              ? t('overview.board.reauth')
              : t('overview.board.comingUpEmpty')}
        </CardEmpty>
      ) : (
        <ul>
          {shown.map((event) => (
            <TriageRow
              key={event.eventId}
              severity={comingUpEventSeverity(event.atMs, nowMs)}
              when={formatDuration((event.atMs - nowMs) / 1000)}
              subject={event.title}
              detail={t(`overview.board.response.${event.response}`)}
              to="/calendar"
            />
          ))}
        </ul>
      )}
    </BoardCard>
  );
}

// --- SP extraction --------------------------------------------------------

/**
 * Spare SP above the 5M floor, and how many extractors it fills.
 *
 * Shown whether or not SP Extraction monitoring is on — the number is true
 * either way — but only monitoring decides anything is *ready*, so with it off
 * the tiles stay untoned and the footer says why.
 */
export function SpExtractionCard({ data }: { data: SpExtractionBoardData }) {
  const { t } = useTranslation();
  const severity = spExtractionSeverity(data);
  const tone = severity === 'watch' ? 'watch' : 'clear';
  return (
    <BoardCard
      title={t('overview.board.spExtraction')}
      meta={<SeverityWord severity={severity} />}
      to="/characters"
      openLabel={t('overview.board.open')}
      footer={
        data.totalSp === null
          ? t('overview.board.checking')
          : data.monitoring
            ? t('overview.board.spExtractionThreshold', {
                sp: formatCompactNumber(data.thresholdSp),
              })
            : t('overview.board.spExtractionOff')
      }
    >
      <TileRow>
        <NumberTile
          label={t('overview.board.spareSp')}
          value={data.totalSp === null ? 0 : formatCompactNumber(extractableSp(data.totalSp))}
          severity={tone}
        />
        <NumberTile
          label={t('overview.board.extractors')}
          value={data.totalSp === null ? 0 : extractorCount(data.totalSp)}
          severity={tone}
        />
      </TileRow>
    </BoardCard>
  );
}

// --- Mail -----------------------------------------------------------------

/**
 * The unread count, and the newest few unread mails as rows. A mail is
 * genuinely its own thing (who sent it, about what), so a handful of rows
 * says more than the number alone — but only a handful: the inbox is the
 * Mail page's job.
 */
export function MailCard({ data, nowMs }: { data: MailBoardData | null; nowMs: number }) {
  const { t } = useTranslation();
  return (
    <BoardCard
      title={t('overview.board.mail')}
      meta={
        <SeverityWord
          severity={mailSeverity(data)}
          warningLabel={data?.needsReauth ? REAUTH_WORD : undefined}
        />
      }
      to="/mail"
      openLabel={t('overview.board.open')}
      footer={mailSummary(t, data)}
    >
      {data === null || data.needsReauth || data.recent.length === 0 ? (
        <CardEmpty>
          {data === null
            ? t('overview.board.checking')
            : data.needsReauth
              ? t('overview.board.reauth')
              : t('overview.board.mailEmpty')}
        </CardEmpty>
      ) : (
        <ul>
          {data.recent.map((mail) => (
            <TriageRow
              key={mail.mailId}
              severity="watch"
              when={mail.atMs === null ? '—' : formatAge(Math.max(0, nowMs - mail.atMs), t)}
              subject={mail.subject || t('overview.board.mailNoSubject')}
              detail={mail.from ?? undefined}
              to="/mail"
            />
          ))}
        </ul>
      )}
    </BoardCard>
  );
}

// --- Price alerts ---------------------------------------------------------

/**
 * Every Quickbar target, crossed ones first, priced from the notification
 * poller's last reading. The footer says how old that reading is, because
 * the board never prices anything itself (`priceAlertsBoard.ts`).
 */
export function PriceAlertsCard({
  data,
  nowMs,
}: {
  data: PriceAlertsBoardData | null;
  nowMs: number;
}) {
  const { t } = useTranslation();
  const crossed = data?.alerts.filter((alert) => alert.crossed).length ?? 0;
  const shown = data?.alerts.slice(0, ROW_LIMIT) ?? [];
  return (
    <BoardCard
      title={t('overview.board.priceAlerts')}
      meta={<SeverityWord severity={priceAlertsSeverity(data)} />}
      to="/market"
      openLabel={t('overview.board.open')}
      footer={
        data === null
          ? t('overview.board.checking')
          : data.checkedAt === null
            ? t('overview.board.priceAlertsNotChecked')
            : t('overview.board.priceAlertsChecked', {
                age: formatAge(Math.max(0, nowMs - data.checkedAt), t),
              })
      }
    >
      {shown.length === 0 ? (
        <CardEmpty>
          {data === null ? t('overview.board.checking') : t('overview.board.priceAlertsEmpty')}
        </CardEmpty>
      ) : (
        <>
          <TileRow>
            <NumberTile
              label={t('overview.board.priceAlertsHit')}
              value={crossed}
              severity="warning"
            />
            <NumberTile
              label={t('overview.board.priceAlertsWatched')}
              value={data?.alerts.length ?? 0}
              severity="clear"
            />
          </TileRow>
          <ul>
            {shown.map((alert) => (
              <TriageRow
                key={alert.typeId}
                severity={alert.crossed ? 'warning' : 'clear'}
                when={alert.price === null ? UNKNOWN : formatIskCompact(alert.price)}
                subject={alert.name}
                detail={t(`overview.board.priceAlertTarget.${alert.direction}`, {
                  price: formatIskCompact(alert.targetPrice),
                })}
                to="/market"
              />
            ))}
          </ul>
        </>
      )}
    </BoardCard>
  );
}

// --- Structures -----------------------------------------------------------

/** What a structure row's clock column says, for each kind of clock. */
function structureWhen(item: CorpBoardItem, t: (key: string) => string): string {
  if (item.timing === 'passed') return t('overview.board.structureDry');
  if (item.timing === 'untimed') return t('overview.board.structureOffline');
  // A clock shorter than CCP's hour-long cache may already be over, so it is
  // not ticked down — the Corp page makes the same call.
  if (item.withinStaleWindow) return t('overview.board.structureSoon');
  return formatDuration(Math.max(0, item.remainingMs ?? 0) / 1000);
}

/**
 * Only what needs doing: reinforcement timers, fuel within three days, and
 * offline services, as counts and then the worst few as rows. A structure
 * whose fuel is weeks out is not a row here — the Corp page lists every one.
 */
export function StructuresCard({ data }: { data: StructuresView | null }) {
  const { t } = useTranslation();
  const items = data?.items ?? null;
  const counts = items ? structureCounts(items) : null;
  // Every timer gets a row — a reinforced structure is never "+1 more" —
  // and the worst of the fuel and service rows fill what room is left.
  const flagged = (items ?? []).filter(
    (item) => item.kind !== 'structureFuel' || item.severity !== 'clear'
  );
  const timers = flagged.filter((item) => item.kind === 'structureTimer');
  const rows = [
    ...timers,
    ...flagged
      .filter((item) => item.kind !== 'structureTimer')
      .slice(0, Math.max(0, ROW_LIMIT - timers.length)),
  ];
  return (
    <BoardCard
      title={t('overview.board.structures')}
      meta={
        <SeverityWord
          severity={structuresSeverity(data)}
          warningLabel={data?.needsReauth ? REAUTH_WORD : undefined}
        />
      }
      to="/corp"
      openLabel={t('overview.board.open')}
      footer={
        data === null
          ? t('overview.board.checking')
          : items === null
            ? t(data.needsReauth ? 'overview.board.reauth' : 'overview.board.corpUnreadable')
            : t('overview.board.structureCount', { count: data.structureCount })
      }
    >
      <TileRow>
        <NumberTile
          label={t('overview.board.reinforced')}
          value={counts === null ? UNKNOWN : counts.timers}
          severity="critical"
        />
        <NumberTile
          label={t('overview.board.lowFuel')}
          value={counts === null ? UNKNOWN : counts.lowFuel}
          severity="warning"
        />
        <NumberTile
          label={t('overview.board.servicesOffline')}
          value={counts === null ? UNKNOWN : counts.offline}
          severity="warning"
        />
      </TileRow>
      {rows.length > 0 && (
        <ul>
          {rows.map((item) => (
            <TriageRow
              key={item.id}
              severity={item.severity}
              when={structureWhen(item, t)}
              subject={item.subject}
              detail={
                item.kind === 'structureTimer'
                  ? structureStateLabel(item.detail)
                  : item.kind === 'serviceOffline'
                    ? t('overview.board.serviceOffline', { service: item.detail })
                    : t('overview.board.fuelRunsOut')
              }
              to="/corp"
            />
          ))}
        </ul>
      )}
    </BoardCard>
  );
}

// --- Moon extractions ------------------------------------------------------

/**
 * One row per moon drill: the chunk's arrival while it is still coming, and
 * its natural decay once it has landed and is waiting to be fractured.
 */
export function MoonChunksCard({
  data,
  nowMs,
}: {
  data: MoonChunksBoardData | null;
  nowMs: number;
}) {
  const { t } = useTranslation();
  const chunks = [...(data?.chunks ?? [])]
    .sort((a, b) => a.deadlineMs - b.deadlineMs)
    .slice(0, ROW_LIMIT);
  return (
    <BoardCard
      title={t('overview.board.moonChunks')}
      meta={
        <SeverityWord
          severity={moonChunksSeverity(data, nowMs)}
          warningLabel={data?.needsReauth ? REAUTH_WORD : 'overview.board.word.ready'}
        />
      }
      to="/corp"
      openLabel={t('overview.board.open')}
      footer={
        data === null
          ? t('overview.board.checking')
          : data.chunks === null
            ? t(data.needsReauth ? 'overview.board.reauth' : 'overview.board.corpUnreadable')
            : t('overview.board.drillCount', { count: data.chunks.length })
      }
    >
      {chunks.length === 0 ? (
        <CardEmpty>
          {data === null
            ? t('overview.board.checking')
            : data.chunks === null
              ? t(data.needsReauth ? 'overview.board.reauth' : 'overview.board.corpUnreadable')
              : t('overview.board.moonChunksEmpty')}
        </CardEmpty>
      ) : (
        <ul>
          {chunks.map((chunk) => (
            <TriageRow
              key={chunk.id}
              severity={moonChunkSeverity(chunk, nowMs)}
              when={formatDuration(Math.max(0, chunk.deadlineMs - nowMs) / 1000)}
              subject={chunk.subject}
              detail={t(`overview.board.chunk.${chunk.detail === 'decay' ? 'decay' : 'arrival'}`)}
              to="/corp"
            />
          ))}
        </ul>
      )}
    </BoardCard>
  );
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
      fill
      className="flex h-full flex-col"
      title={t('overview.board.alerts')}
      meta={
        <span className="text-[0.6875rem] text-text-dim">
          {t('overview.board.alertsUnread', { count: unread })}
        </span>
      }
      actions={
        unread > 0 ? (
          <button type="button" onClick={onDismissAll} className={textActionClassName()}>
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

// --- Everything else ------------------------------------------------------

export interface FoldedDomain {
  key: string;
  domain: string;
  summary: string;
  severity: DeadlineSeverity | null;
  to: string;
  danger?: boolean;
}

/**
 * The phone's tail end: every domain past the pilot's first two, one line
 * each.
 *
 * Below `sm` about three cards fit above the fold, so a board of every card
 * plus an alerts column is screens of scrolling — and the two the pilot put
 * first are already at the top, whole. This says
 * what the rest are up to without asking for the room to show it, and each row
 * leads to the page that would.
 *
 * A `Panel` rather than a `BoardCard`: it has no page of its own to open, and
 * "Everything else" is a leftover rather than a domain.
 */
export function EverythingElseCard({ domains }: { domains: readonly FoldedDomain[] }) {
  const { t } = useTranslation();
  if (domains.length === 0) return null;
  return (
    <Panel title={t('overview.board.everythingElse')} padded={false}>
      <ul>
        {domains.map((entry) => (
          <FoldedRow
            key={entry.key}
            domain={entry.domain}
            summary={entry.summary}
            severity={entry.severity}
            to={entry.to}
            danger={entry.danger}
          />
        ))}
      </ul>
    </Panel>
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
const REAUTH_WORD = 'overview.board.word.reauth';

/**
 * `warningLabel` swaps only the generic "Due soon" word: that one is false on
 * every card here except a planetary batch, so each domain names its own
 * reason. The severity itself (and so the phone sort) is untouched.
 */
function SeverityWord({
  severity,
  warningLabel,
}: {
  severity: DeadlineSeverity | null;
  warningLabel?: string;
}) {
  const { t } = useTranslation();
  // Nothing at all while the card is still loading: a "Clear" verdict over a
  // footer reading "Checking…" is a claim the card cannot yet make.
  if (severity === null) return null;
  return (
    <span className="flex min-w-0 items-center gap-1 text-[0.6875rem] tracking-widest whitespace-nowrap uppercase">
      <SeverityIcon severity={severity} />
      <span className="truncate text-text-dim">
        {t(severity === 'warning' && warningLabel ? warningLabel : SEVERITY_LABEL[severity])}
      </span>
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
