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
import { MINUTE_MS } from '@/lib/age';

function isStale(contract: Contract, nowMs: number): boolean {
  return contract.status === 'outstanding' && new Date(contract.date_expired).getTime() < nowMs;
}

const CONTRACT_CLOCK_MS = MINUTE_MS;

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

export function ContractDateCell({ iso, timeZone }: { iso: string; timeZone: string | undefined }) {
  const date = new Date(iso);
  return (
    <HintText content={formatTimestamp(date, timeZone)}>{formatDateOnly(date, timeZone)}</HintText>
  );
}
