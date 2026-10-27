import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { HintText } from '@/components/ui/HintText';
import { formatCountdown } from '@/lib/duration';
import { useTicker } from '@/lib/ticker';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import { CONTRACT_STATUS_KEY } from '@/features/character/contractLabels';
import type { Contract } from '@/esi/endpoints';

/**
 * Lapsed and unclaimed — still `outstanding` past its accept-by deadline.
 * `date_expired` is only ever "the deadline to act", not "when this row
 * stopped mattering": a finished/cancelled/etc. contract's deadline is
 * naturally in the past for anything old, so dimming on date alone (the
 * previous behavior) faded almost every completed contract in the list.
 */
function isStale(contract: Contract, nowMs: number): boolean {
  return contract.status === 'outstanding' && new Date(contract.date_expired).getTime() < nowMs;
}

/**
 * Minute cadence for the History table's clock-dependent cells. Their own
 * components, not a `Date.now()` in the column's `render`: `DataTable`'s rows
 * are memoized, so a render-time read would stay frozen until the row itself
 * changed — an outstanding contract would never flip to lapsed, a courier
 * never to overdue, while the page stayed open.
 */
const CONTRACT_CLOCK_MS = 60_000;

/** The status label, with the lapsed-offer warning once its accept-by deadline passes. */
export function ContractStatusCell({ contract }: { contract: Contract }) {
  const { t } = useTranslation();
  const nowMs = useTicker(CONTRACT_CLOCK_MS);
  const label = t(CONTRACT_STATUS_KEY[contract.status]);
  return isStale(contract, nowMs) ? (
    <Tooltip content={t('contracts.staleTooltip')} openOnTap>
      <span tabIndex={0} className={cx('inline-flex items-center gap-1', focusRingClassName)}>
        <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0" />
        {label}
        <span className="sr-only">{t('contracts.staleTooltip')}</span>
      </span>
    </Tooltip>
  ) : (
    label
  );
}

/**
 * Yesterday's calendar day in `timeZone`, formatted like `formatDateOnly`.
 * Walks the calendar rather than subtracting 24h, which lands on the wrong day
 * across a DST change (a 23- or 25-hour day).
 */
function formatYesterday(nowMs: number, timeZone: string | undefined): string {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(nowMs))
    .split('-')
    .map(Number);
  return formatDateOnly(new Date(Date.UTC(year, month - 1, day - 1, 12)), 'UTC');
}

/** A phone day section's header: the date, and how many contracts were issued that day. */
export function ContractDayHeader({
  date,
  count,
  timeZone,
}: {
  date: string;
  count: number;
  timeZone: string | undefined;
}) {
  const { t } = useTranslation();
  // Today and yesterday read as words; anything older keeps its date.
  const now = useTicker(CONTRACT_CLOCK_MS);
  const label =
    date === formatDateOnly(new Date(now), timeZone)
      ? t('contracts.today')
      : date === formatYesterday(now, timeZone)
        ? t('contracts.yesterday')
        : date;
  return (
    <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-semibold">{label}</span>
      <span className="text-[0.6875rem] text-text-dim tabular-nums">
        {t('contracts.dayCount', { count })}
      </span>
    </span>
  );
}

/** An accepted courier's delivery deadline, counting down to overdue. */
export function CourierDeadlineCell({
  deadlineMs,
  timeZone,
}: {
  deadlineMs: number;
  timeZone: string | undefined;
}) {
  const { t } = useTranslation();
  const remainingMs = deadlineMs - useTicker(CONTRACT_CLOCK_MS);
  const date = new Date(deadlineMs);
  const time = formatDateOnly(date, timeZone);
  return (
    <HintText
      content={formatTimestamp(date, timeZone)}
      className={remainingMs <= 0 ? 'text-danger' : undefined}
    >
      {remainingMs <= 0
        ? t('contracts.deliverOverdue', { time })
        : t('contracts.deliverDue', { time, duration: formatCountdown(remainingMs / 1000) })}
    </HintText>
  );
}

/** A date alone in the cell; the exact time rides a tooltip (the detail modal carries it on touch). */
export function ContractDateCell({ iso, timeZone }: { iso: string; timeZone: string | undefined }) {
  const date = new Date(iso);
  return (
    <HintText content={formatTimestamp(date, timeZone)}>{formatDateOnly(date, timeZone)}</HintText>
  );
}
