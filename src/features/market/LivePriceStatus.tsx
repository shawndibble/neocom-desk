import { priceMarkKey } from './priceStateLabel';
import { useTranslation } from 'react-i18next';
import { LiveStatus, ProgressBar, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PriceState } from '@/engine/market/appraisal';
import { cx } from '@/lib/cx';
import { formatAge, MINUTE_MS } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import type { LiveProgress } from './useAppraisalLive';

const AGE_TICK_MS = 5_000;

const STATUS_LINE = 'inline-block min-w-[13rem]';

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
      <LiveStatus>{announcement}</LiveStatus>
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
