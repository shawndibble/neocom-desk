/**
 * The live-price status on the Appraisal page (issue #5591, mockup variant B):
 * the thin bar is the top border of the card it describes, the text sits in
 * that card's title bar, and a row still on a Fuzzwork price wears a mark.
 * Colour never carries the meaning alone: the mark is an icon with a spoken
 * and hover label.
 */
import { useTranslation } from 'react-i18next';
import { ProgressBar, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PriceState } from '@/engine/market/appraisal';
import { cx } from '@/lib/cx';
import { formatAge, MINUTE_MS } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import type { LiveProgress } from './useAppraisalLive';

const AGE_TICK_MS = 5_000;

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

function CheckedAgo({ checkedAt }: { checkedAt: number }) {
  const { t } = useTranslation();
  const now = useTicker(AGE_TICK_MS);
  const ms = Math.max(0, now - checkedAt);
  return ms < MINUTE_MS
    ? t('market.appraisal.live.ageSeconds', { count: Math.floor(ms / 1000) })
    : formatAge(ms, t);
}

/**
 * "Checking live prices 23 / 60" while rows load, then "Live prices · checked
 * 14 s ago". It never says "live" for a list with a cached row: a failed row
 * turns the done line into "Live prices for 59 of 60 rows". Renders nothing
 * before any run (`checkingOnly` also hides the done line, for Compare Hubs).
 */
export function LivePriceStatus({
  live,
  checkingOnly = false,
}: {
  live: LiveProgress;
  checkingOnly?: boolean;
}) {
  const { t } = useTranslation();
  if (live.total === 0) return null;
  if (live.checking) {
    return (
      <span className="text-xs text-text-dim tabular-nums" role="status">
        {t('market.appraisal.live.checking', { done: live.done, total: live.total })}
      </span>
    );
  }
  if (checkingOnly || live.checkedAt === null) return null;
  const summary =
    live.failed === 0
      ? t('market.appraisal.live.done')
      : t('market.appraisal.live.partial', { live: live.total - live.failed, total: live.total });
  return (
    <span className="text-xs text-text-dim">
      {summary} · {t('market.appraisal.live.checkedPrefix')}{' '}
      <CheckedAgo checkedAt={live.checkedAt} />
    </span>
  );
}

/** A clock (still the cached price) or a warning (its live book failed) beside a price; nothing once live. */
export function PriceMark({ state }: { state: PriceState | undefined }) {
  const { t } = useTranslation();
  if (state === undefined || state === 'live') return null;
  const failed = state === 'failed';
  const label = t(failed ? 'market.appraisal.live.markFailed' : 'market.appraisal.live.markCached');
  return (
    <Tooltip content={label}>
      <span
        className={cx('mr-1 inline-flex align-middle', failed ? 'text-warning' : 'text-text-dim')}
      >
        {failed ? (
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        ) : (
          <Icon.Recent size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        )}
        <span className="sr-only">{label}</span>
      </span>
    </Tooltip>
  );
}
