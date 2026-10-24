import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { AuditEntry } from '../taxBook/bookClient';
import { isk, shortDateTime } from './moonsFormat';
import type { AuditSubject } from './useAuditSubject';

function detailLine(entry: AuditEntry, t: TFunction): string {
  const revoked = entry.detail.officersRevoked;
  if (entry.action === 'reclaim' && typeof revoked === 'number')
    return t('corpTaxBook.moons.activity.officersRevoked', { count: revoked });
  const reason = entry.detail.reason;
  return typeof reason === 'string' && reason ? reason : '';
}

/** One line per entry: when, who, what, and the reason (or a reclaim's revoked count) when it had one. */
export function AuditFeed({
  entries,
  empty,
  subject,
}: {
  entries: readonly AuditEntry[];
  empty?: string;
  subject?: AuditSubject;
}) {
  const { t } = useTranslation();
  if (entries.length === 0)
    return (
      <p className="text-sm text-text-dim">{empty ?? t('corpTaxBook.moons.activity.empty')}</p>
    );
  return (
    <ul className="divide-y divide-line text-sm">
      {entries.map((a) => {
        const why = detailLine(a, t);
        const who = subject?.(a) ?? null;
        return (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
            <span className="w-28 shrink-0 text-xs text-text-dim tabular-nums">
              {shortDateTime(new Date(a.at).toISOString())}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">
                {a.byName || t('corpTaxBook.moons.activity.system')}
              </span>{' '}
              {who
                ? t(
                    `corpTaxBook.moons.activity.actionsTo.${a.action}${
                      a.action === 'issueStatement' && who.amount === undefined ? 'Plain' : ''
                    }`,
                    { name: who.name, amount: who.amount === undefined ? '' : isk(who.amount) }
                  )
                : t(`corpTaxBook.moons.activity.actions.${a.action}`, { defaultValue: a.action })}
              {a.via === 'scheduled sync' && (
                <span className="text-text-dim">
                  {' '}
                  ({t('corpTaxBook.moons.activity.viaScheduled')})
                </span>
              )}
              {why && <span className="text-text-dim"> · {why}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
