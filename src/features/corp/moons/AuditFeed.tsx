import type { ReactNode } from 'react';
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

/** One row of an Activity feed: the time, then what happened; `aside` is a row action at the end. */
export function ActivityRow({
  at,
  children,
  aside,
}: {
  /** An instant (ISO). */
  at: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
      <span className="w-28 shrink-0 text-xs text-text-dim tabular-nums">{shortDateTime(at)}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {aside}
    </li>
  );
}

/** One audit entry as a line: when, who, what, and the reason (or a reclaim's revoked count) when it had one. */
export function AuditLine({
  entry: a,
  subject,
  context,
}: {
  entry: AuditEntry;
  subject?: AuditSubject;
  /** What the entry is about, when the page does not already say it (a Statement's period and amount). */
  context?: ReactNode;
}) {
  const { t } = useTranslation();
  const why = detailLine(a, t);
  const who = subject?.(a) ?? null;
  // A queued mail is a Statement or a reminder; `kind` says which.
  const action =
    a.action === 'recordMail' && a.detail.kind === 'reminder' ? 'recordReminder' : a.action;
  return (
    <ActivityRow at={new Date(a.at).toISOString()}>
      <span className="font-semibold">{a.byName || t('corpTaxBook.moons.activity.system')}</span>{' '}
      {who
        ? t(
            `corpTaxBook.moons.activity.actionsTo.${action}${a.action === 'issueStatement' && who.amount === undefined ? 'Plain' : ''}`,
            { name: who.name, amount: who.amount === undefined ? '' : isk(who.amount) }
          )
        : t(`corpTaxBook.moons.activity.actions.${action}`, { defaultValue: a.action })}
      {a.via === 'scheduled sync' && (
        <span className="text-text-dim"> ({t('corpTaxBook.moons.activity.viaScheduled')})</span>
      )}
      {context && <span className="text-text-dim"> · {context}</span>}
      {why && <span className="text-text-dim"> · {why}</span>}
    </ActivityRow>
  );
}

/** One line per entry. */
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
      {entries.map((a) => (
        <AuditLine key={a.id} entry={a} subject={subject} />
      ))}
    </ul>
  );
}
