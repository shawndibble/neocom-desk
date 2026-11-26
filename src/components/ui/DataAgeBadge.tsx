import { useTranslation } from 'react-i18next';
import { formatAge, HOUR_MS, DAY_MS, MINUTE_MS } from '@/lib/age';
import { formatTimeOfDay, formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { useTicker } from '@/lib/ticker';
import { Tooltip } from './Tooltip';

const TICK_MS = 30_000;

interface DataAgeBadgeProps {
  date: Date;
  note?: string;
  expiresAt?: Date;
  dotOnly?: boolean;
  alwaysVisible?: boolean;
  tooltip?: boolean;
  className?: string;
}

function toneFor(ms: number): string {
  if (ms < HOUR_MS) return 'text-text-dim';
  if (ms < DAY_MS) return 'text-warning';
  return 'text-danger';
}

export function DataAgeBadge({
  date,
  note,
  expiresAt,
  dotOnly = false,
  alwaysVisible = false,
  tooltip = true,
  className = '',
}: DataAgeBadgeProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const now = useTicker(TICK_MS);

  const ms = Math.max(0, now - date.getTime());
  const age = formatAge(ms, t);
  const content = [dotOnly ? age : null, formatTimestamp(date, timeZone), note]
    .filter(Boolean)
    .join(' — ');
  const expiry =
    expiresAt === undefined
      ? null
      : expiresAt.getTime() > now
        ? t('common.dataAge.esiUpdatesIn', {
            count: Math.max(1, Math.ceil((expiresAt.getTime() - now) / MINUTE_MS)),
            time: formatTimeOfDay(expiresAt, timeZone),
          })
        : t('common.dataAge.esiMayHaveNewer');
  const tip = expiry ? (
    <>
      <span className="block">{content}</span>
      <span className="block">{expiry}</span>
    </>
  ) : (
    content
  );

  const badge = (
    <time
      dateTime={date.toISOString()}
      tabIndex={tooltip ? 0 : undefined}
      className={`items-center gap-1.5 text-[0.6875rem] tabular-nums ${
        alwaysVisible ? 'inline-flex' : 'hidden md:inline-flex'
      } ${toneFor(ms)} ${className}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {dotOnly ? <span className="sr-only">{age}</span> : age}
    </time>
  );

  return tooltip ? (
    <Tooltip content={tip} openOnTap>
      {badge}
    </Tooltip>
  ) : (
    badge
  );
}
