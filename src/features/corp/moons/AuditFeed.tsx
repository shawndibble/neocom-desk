import { useTranslation } from 'react-i18next';
import type { AuditEntry } from '../taxBook/bookClient';
import { shortDateTime } from './moonsFormat';

function detailLine(entry: AuditEntry): string {
  const reason = entry.detail.reason;
  return typeof reason === 'string' && reason ? reason : '';
}

/** One line per entry: when, who, what, and the reason when it had one. */
export function AuditFeed({ entries, empty }: { entries: readonly AuditEntry[]; empty?: string }) {
  const { t } = useTranslation();
  if (entries.length === 0)
    return (
      <p className="text-sm text-text-dim">{empty ?? t('corpTaxBook.moons.activity.empty')}</p>
    );
  return (
    <ul className="divide-y divide-line text-sm">
      {entries.map((a) => {
        const why = detailLine(a);
        return (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
            <span className="w-28 shrink-0 text-xs text-text-dim tabular-nums">
              {shortDateTime(new Date(a.at).toISOString())}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">
                {a.byName || t('corpTaxBook.moons.activity.system')}
              </span>{' '}
              {t(`corpTaxBook.moons.activity.actions.${a.action}`, { defaultValue: a.action })}
              {why && <span className="text-text-dim"> · {why}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
