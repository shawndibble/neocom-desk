import { Fragment, type ReactNode } from 'react';
import { LEGACY_ISSUE_ACTION } from '../taxBook/bookClient';
import { useTimeZone } from '@/lib/timeFormat';
import type { TFunction } from 'i18next';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import type { AuditEntry } from '../taxBook/bookClient';
import { isk, shortDateTime } from './moonsFormat';
import type { AuditSubject } from './useAuditSubject';
import type { AuditWordsOf } from './useAuditWords';

function detailLine(entry: AuditEntry, t: TFunction): string {
  const revoked = entry.detail.officersRevoked;
  if (entry.action === 'reclaim' && typeof revoked === 'number')
    return t('corpTaxBook.moons.activity.officersRevoked', { count: revoked });
  const reason = entry.detail.reason;
  return typeof reason === 'string' && reason ? reason : '';
}

export function ActivityRow({
  at,
  children,
  aside,
}: {
  at: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const zone = useTimeZone();
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
      <span className="w-28 shrink-0 text-xs text-text-dim tabular-nums">
        {shortDateTime(at, zone)}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {aside}
    </li>
  );
}

export function AuditLine({
  entry: a,
  subject,
  context,
  onOpen,
  words: wordsOf,
}: {
  entry: AuditEntry;
  subject?: AuditSubject;
  words?: AuditWordsOf;
  context?: ReactNode;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const why = detailLine(a, t);
  const who = subject?.(a) ?? null;
  const words = wordsOf?.(a) ?? {};
  const action =
    words.action ??
    ((a.action === 'recordMail' || a.action === 'recordLateNoticeMail') &&
    a.detail.kind === 'reminder'
      ? 'recordReminder'
      : a.action);
  const minerLink = who?.path ? (
    <Link to={who.path} className={entityLinkClassName()} onClick={onOpen}>
      {who.name}
    </Link>
  ) : undefined;
  const inSentence = who !== null && who.inSentence !== false;
  return (
    <ActivityRow at={new Date(a.at).toISOString()}>
      <span className="font-semibold">{a.byName || t('corpTaxBook.moons.activity.system')}</span>{' '}
      {inSentence ? (
        <Trans
          i18nKey={`corpTaxBook.moons.activity.actionsTo.${action}${a.action === LEGACY_ISSUE_ACTION && who.amount === undefined ? 'Plain' : ''}`}
          values={{ name: who.name, amount: who.amount === undefined ? '' : isk(who.amount) }}
          components={{ name: minerLink ?? <Fragment /> }}
        />
      ) : (
        t(`corpTaxBook.moons.activity.actions.${action}`)
      )}
      {!inSentence && minerLink && <> · {minerLink}</>}
      {a.via === 'scheduled sync' && (
        <span className="text-text-dim"> ({t('corpTaxBook.moons.activity.viaScheduled')})</span>
      )}
      {context && <span className="text-text-dim"> · {context}</span>}
      {words.amount !== undefined && (
        <span className="text-text-dim">
          {' '}
          · {t('corpTaxBook.moons.activity.declaredAmount', { amount: isk(words.amount) })}
        </span>
      )}
      {words.said && <span className="text-text-dim"> · “{words.said}”</span>}
      {why && why !== words.said && <span className="text-text-dim"> · {why}</span>}
    </ActivityRow>
  );
}

export function AuditFeed({
  entries,
  empty,
  subject,
  onOpen,
  words,
}: {
  entries: readonly AuditEntry[];
  empty?: string;
  subject?: AuditSubject;
  words?: AuditWordsOf;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  if (entries.length === 0)
    return (
      <p className="text-sm text-text-dim">{empty ?? t('corpTaxBook.moons.activity.empty')}</p>
    );
  return (
    <ul className="divide-y divide-line text-sm">
      {entries.map((a) => (
        <AuditLine key={a.id} entry={a} subject={subject} onOpen={onOpen} words={words} />
      ))}
    </ul>
  );
}
