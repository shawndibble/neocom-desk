/**
 * The live-price status on the Appraisal page (issue #5591, mockup variant B):
 * the thin bar is the top border of the card it describes, the text sits in
 * that card's title bar, and a row still on a Fuzzwork price wears a mark.
 * Colour never carries the meaning alone: the mark is an icon with a spoken
 * and hover label.
 */
import { priceMarkKey } from './priceStateLabel';
import { useTranslation } from 'react-i18next';
import { ProgressBar, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PriceState } from '@/engine/market/appraisal';
import { cx } from '@/lib/cx';
import { formatAge, MINUTE_MS } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import type { LiveProgress } from './useAppraisalLive';

const AGE_TICK_MS = 5_000;

/** Both lines claim the done line's width, so the title bar wraps the same way while checking and when done: no layout shift when the text swaps. */
const STATUS_LINE = 'inline-block min-w-[19rem]';

/** The bar alone, for the caller to lay along a card's top edge. */
export function LivePriceBar({ live, className }: { live: LiveProgress; className?: string }) {
  const { t } = useTranslation();
  return (
    <ProgressBar
      label={t('market.appraisal.live.barLabel')}
      value={live.done}
      max={Math.max(live.total, 1)}
      size="xs"
      className={className}
    />
  );
}

function CheckedAgo({ summary, checkedAt }: { summary: string; checkedAt: number }) {
  const { t } = useTranslation();
  const now = useTicker(AGE_TICK_MS);
  const ms = Math.max(0, now - checkedAt);
  const age =
    ms < MINUTE_MS
      ? t('market.appraisal.live.ageSeconds', { count: Math.floor(ms / 1000) })
      : formatAge(ms, t);
  return (
    <span className={cx(STATUS_LINE, 'text-xs text-text-dim')}>
      {summary} · {t('market.appraisal.live.checkedAgo', { age })}
    </span>
  );
}

/**
 * "Checking live prices 23 / 60" while rows load, then "Live prices · checked
 * 14 s ago". It never says "live" for a list with a cached row: a failed row
 * turns the done line into "Live prices for 59 of 60 rows". Shows nothing
 * before any run (`checkingOnly` also hides the done line, for Compare Hubs).
 *
 * A persistent polite live region announces only the start and the finish,
 * never the per-row count or the ticking age: the bar's own value carries the
 * progress. It stays mounted so a later change is announced.
 */
export function LivePriceStatus({
  live,
  checkingOnly = false,
}: {
  live: LiveProgress;
  checkingOnly?: boolean;
}) {
  const { t } = useTranslation();
  const showDone = live.total > 0 && !live.checking && !checkingOnly && live.checkedAt !== null;
  const summary = !showDone
    ? ''
    : live.failed === 0
      ? t('market.appraisal.live.done')
      : t('market.appraisal.live.partial', { live: live.total - live.failed, total: live.total });
  const announcement =
    live.total > 0 && live.checking ? t('market.appraisal.live.announceChecking') : summary;
  return (
    <>
      <span className="sr-only" role="status">
        {announcement}
      </span>
      {live.total > 0 && live.checking && (
        <span className={cx(STATUS_LINE, 'text-xs text-text-dim tabular-nums')} aria-hidden="true">
          {t('market.appraisal.live.checking', { done: live.done, total: live.total })}
        </span>
      )}
      {showDone && live.checkedAt !== null && (
        <CheckedAgo summary={summary} checkedAt={live.checkedAt} />
      )}
    </>
  );
}

/**
 * A clock (still the cached price) or a warning (its live book failed) beside
 * a price; nothing once live. `silent` keeps the icon and tooltip but drops the
 * spoken text, for the second and later price cells of one row.
 */
export function PriceMark({
  state,
  silent = false,
}: {
  state: PriceState | undefined;
  silent?: boolean;
}) {
  const { t } = useTranslation();
  const markKey = priceMarkKey(state);
  if (markKey === null) return null;
  const failed = state === 'failed';
  const label = t(markKey);
  return (
    <Tooltip content={label}>
      <span
        className={cx('mr-1 inline-flex align-middle', failed ? 'text-warning' : 'text-text-dim')}
        aria-hidden={silent || undefined}
      >
        {failed ? (
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        ) : (
          <Icon.Recent size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        )}
        {!silent && <span className="sr-only">{label}</span>}
      </span>
    </Tooltip>
  );
}
