import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { SrpAuditEntry } from '../srpClaimTypes';
import { auditText } from './srpAuditText';

/** One claim's audit entries, oldest first: when, who, what. */
export function SrpAuditTrail({ entries }: { entries: readonly SrpAuditEntry[] }) {
  const { t } = useTranslation();
  const zone = useTimeZone();
  if (entries.length === 0) {
    return <p className="text-sm text-text-dim">{t('srp.officer.detail.auditEmpty')}</p>;
  }
  return (
    <ol className="space-y-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-2">
          <span className="text-xs text-text-dim tabular-nums">
            {formatTimestamp(new Date(entry.at), zone)}
          </span>
          <span>
            <span className="font-semibold">{entry.byName}</span>{' '}
            <span className="text-text-dim">{auditText(t, entry)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
