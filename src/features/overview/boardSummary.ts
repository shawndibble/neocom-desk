/**
 * What each domain says in one line, for the phone's folded rows.
 *
 * Below `sm` only the two worst cards keep their full shape and the rest
 * collapse into "Everything else" (`Overview.tsx`), where a domain gets a
 * single line to state its case. That line is not a shortened card: a card can
 * afford three counts and let the reader weigh them, a row has to pick the one
 * fact that decides whether to tap it. So each function here ranks the same
 * way its `boardSeverity.ts` sibling does and prints the worst true thing —
 * the ISK you owe over the entries nobody has assigned, the jobs waiting to be
 * delivered over the ones still running.
 *
 * **Three states, never two.** A read that has not landed, a grant that has
 * lapsed, and a genuinely quiet domain all arrive here as an empty list, and
 * printing "Nothing running" for the first two is exactly the silence this
 * board was rebuilt to remove. Every function takes its domain's nullable
 * snapshot rather than the array inside it, so it can tell them apart at all.
 *
 * Strings, not keys: resolved through the caller's `t` the way
 * `alertGroupLabel` is, because a row that returned a key would leave each
 * call site to remember which of these need a `count` and which do not.
 */
import { formatIskCompact } from '@/lib/isk';
import { isJobDone } from '@/features/industry/jobs';
import { needsAttentionCount, openOrderProblemCounts } from '@/features/market/openOrdersModel';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import { compareSeverity } from '@/engine/severity';
import type { IndustryBoardData, MiningTaxBoardData, PlanetaryBoardData } from './boardData';

/**
 * The narrow slice of i18next's `t` these need: a key, and interpolations that
 * are counts or already-formatted strings.
 */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

const CHECKING = 'overview.board.checking';
const REAUTH = 'overview.board.reauth';

/**
 * Orders: what is below cost, else how many need work at all.
 *
 * `needsAttentionCount` rather than the sum of the card's three tiles — those
 * count *problems* and an order can carry two, which is the right figure for
 * three tiles side by side and the wrong one for a row that is telling you how
 * many orders to go and fix.
 */
export function ordersSummary(
  t: Translate,
  rows: readonly OpenOrderRow[] | null,
  needsReauth: boolean
): string {
  if (needsReauth) return t(REAUTH);
  if (rows === null) return t(CHECKING);
  const counts = openOrderProblemCounts(rows);
  if (counts.belowFloor > 0) return t('overview.board.belowFloor', { count: counts.belowFloor });
  const needsWork = needsAttentionCount(rows);
  return needsWork > 0
    ? t('overview.board.ordersMeta', { count: needsWork })
    : t('overview.board.ordersClear');
}

/** Mining tax: what is owed, else what has not been worked out yet. */
export function miningTaxSummary(t: Translate, data: MiningTaxBoardData | null): string {
  if (data === null) return t(CHECKING);
  if (data.needsReauth) return t(REAUTH);
  if (data.unpaidIsk > 0)
    return t('overview.board.miningUnpaid', { isk: formatIskCompact(data.unpaidIsk) });
  return data.unassignedCount > 0
    ? t('overview.board.miningUnassigned', { count: data.unassignedCount })
    : t('overview.board.miningSettled');
}

/**
 * Planetary: the worst reset run, named the way the card names it.
 *
 * Ranked by severity rather than read off the front of the list —
 * `groupColoniesIntoBatches` orders by clock, and the batch that stopped six
 * hours ago sorts behind one ending in three.
 */
export function planetarySummary(t: Translate, data: PlanetaryBoardData | null): string {
  if (data === null) return t(CHECKING);
  if (data.needsReauth) return t(REAUTH);
  const worst = [...data.batches].sort((a, b) => compareSeverity(a.severity, b.severity))[0];
  if (worst === undefined) return t('overview.board.noColonies');
  return t(`overview.board.batch.${worst.kind}`, { count: worst.colonies.length });
}

/** Industry: what is waiting to be delivered, else what is still running. */
export function industrySummary(
  t: Translate,
  data: IndustryBoardData | null,
  nowMs: number
): string {
  if (data === null) return t(CHECKING);
  if (data.needsReauth) return t(REAUTH);
  const done = data.jobs.filter((job) => isJobDone(job, nowMs)).length;
  if (done > 0) return t('overview.board.jobsReady', { count: done });
  const running = data.jobs.length - done;
  return running > 0
    ? t('overview.board.industryRunning', { count: running })
    : t('overview.board.industryIdle');
}

/**
 * Alerts: how many are unread, and across how many types.
 *
 * Two lookups joined, not one key with two counts — i18next inflects a single
 * `count` per lookup, so one key asked to plural both would render "1 unread ·
 * 1 types" the moment either figure is one.
 *
 * No unreadable state: the feed is this device's own Dexie table, so unlike
 * every other row here it cannot fail to load or lose a grant.
 */
export function alertsSummary(t: Translate, unread: number, typeCount: number): string {
  if (unread === 0) return t('overview.board.alertsEmpty');
  return `${t('overview.board.alertsUnread', { count: unread })} · ${t(
    'overview.board.alertTypes',
    { count: typeCount }
  )}`;
}
