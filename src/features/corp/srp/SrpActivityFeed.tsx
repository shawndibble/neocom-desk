import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsiblePanel, Panel } from '@/components/ui';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { useIsPhone } from '@/lib/useIsPhone';
import type { SrpAuditEntry } from '../srpClaimTypes';
import { auditText } from './srpAuditText';

function ActivityList({ entries }: { entries: readonly SrpAuditEntry[] }) {
  const { t } = useTranslation();
  const zone = useTimeZone();
  if (entries.length === 0) {
    return <p className="text-sm text-text-dim">{t('srp.officer.activity.empty')}</p>;
  }
  return (
    <ol className="space-y-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="grid items-baseline gap-x-3 sm:grid-cols-[7.5rem_9rem_1fr]">
          <span className="text-xs text-text-dim tabular-nums">
            {formatTimestamp(new Date(entry.at), zone)}
          </span>
          <span className="font-semibold">{entry.byName}</span>
          <span className="text-text-dim">{auditText(t, entry)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Every audit entry of the corporation's SRP, newest first. A phone folds it away. */
export function SrpActivityFeed({ entries }: { entries: readonly SrpAuditEntry[] }) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  if (phone) {
    return (
      <CollapsiblePanel
        title={t('srp.officer.activity.title')}
        meta={
          <span className="text-xs text-text-dim">
            {t('srp.officer.activity.count', { count: entries.length })}
          </span>
        }
        expanded={open}
        onToggle={() => setOpen(!open)}
        labels={{ show: t('srp.officer.activity.show'), hide: t('srp.officer.activity.hide') }}
      >
        <ActivityList entries={entries} />
      </CollapsiblePanel>
    );
  }
  return (
    <Panel
      title={t('srp.officer.activity.title')}
      meta={<span className="text-xs text-text-dim">{t('srp.officer.activity.meta')}</span>}
    >
      <ActivityList entries={entries} />
    </Panel>
  );
}
