import { useTranslation } from 'react-i18next';
import { dayClosesAt } from '@/engine/corpTaxBook/billable';
import { formatAge, MINUTE_MS } from '@/lib/age';
import { formatIsk } from '@/lib/isk';
import { useTicker } from '@/lib/ticker';
import type { CorpBookViewBook } from './corpBookView';
import { utcDay } from '@/engine/localDay';

function shortDate(date: string, language: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(language === 'en' ? 'en-GB' : language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function CorpBookSyncNote({
  book,
  owedNow,
  now: nowOverride,
  showStanding = true,
  inDialog = false,
}: {
  book: CorpBookViewBook;
  owedNow: number;
  now?: number;
  showStanding?: boolean;
  inDialog?: boolean;
}) {
  const here = inDialog ? 'Here' : '';
  const ticked = useTicker(MINUTE_MS);
  const now = nowOverride ?? ticked;
  const { t, i18n } = useTranslation();
  const { summary, corpName, loaded } = book;
  const synced = summary.lastSyncedAt;
  const ago = synced ? formatAge(Math.max(0, now - Date.parse(synced)), t) : null;
  const finalThrough =
    book.finalThrough !== undefined &&
    (summary.closedThrough === undefined || book.finalThrough > summary.closedThrough)
      ? book.finalThrough
      : undefined;
  const closedThrough = finalThrough ?? summary.closedThrough;
  const credit = summary.credit > 0;
  const account = summary.account;
  const estimateFrom = summary.estimate > 0 ? book.estimateFrom : undefined;
  const estimateClosesAt = estimateFrom
    ? new Date(dayClosesAt(estimateFrom, loaded.graceHours))
    : null;
  const estimateWords = estimateFrom &&
    estimateClosesAt && {
      estimate: formatIsk(summary.estimate, 0),
      date: shortDate(estimateFrom, i18n.language),
      time: estimateClosesAt.toISOString().slice(11, 16),
      closeDate: shortDate(utcDay(estimateClosesAt.getTime()), i18n.language),
      corp: corpName,
    };
  const standing =
    showStanding && estimateWords
      ? t('miningTax.corpBook.sync.owesWithEstimate', {
          ...estimateWords,
          amount: formatIsk((account?.owes?.amount ?? 0) + summary.estimate, 0),
        })
      : showStanding && summary.estimate > 0
        ? t('miningTax.corpBook.sync.owes', {
            amount: formatIsk((account?.owes?.amount ?? 0) + summary.estimate, 0),
            corp: corpName,
          })
        : showStanding && account?.owes
          ? t('miningTax.corpBook.sync.behind', {
              amount: formatIsk(account.owes.amount, 0),
              count: account.owes.days,
              date: shortDate(account.owes.oldest, i18n.language),
              corp: corpName,
            })
          : null;
  const rolled = (loaded.adjustments ?? [])
    .filter((a) => a.kind === 'opening' && !a.reversed)
    .reduce((sum, a) => sum + a.amount, 0);
  const opening =
    (rolled > 0 && (owedNow > 0 || account?.owes)) || (rolled < 0 && credit) ? rolled : 0;
  const hasWords =
    owedNow > 0 ||
    book.pendingFrom !== undefined ||
    (credit && !account) ||
    standing !== null ||
    Math.abs(opening) >= 1;
  if (!hasWords) return null;

  const settlingFrom = closedThrough !== undefined ? book.settlingFrom : undefined;
  const safe =
    (owedNow > 0 || book.pendingFrom !== undefined) && !(estimateWords && showStanding)
      ? settlingFrom
        ? t(`miningTax.corpBook.sync.settling${here}`, {
            date: shortDate(settlingFrom, i18n.language),
            corp: corpName,
            ago,
          })
        : closedThrough
          ? t(`miningTax.corpBook.sync.safe${here}`, {
              date: shortDate(closedThrough, i18n.language),
              corp: corpName,
              ago,
            })
          : synced
            ? t(`miningTax.corpBook.sync.safeOnce${here}`, { corp: corpName, ago })
            : t(`miningTax.corpBook.sync.neverSynced${here}`, { corp: corpName })
      : null;
  const closesAt = book.pendingFrom
    ? new Date(dayClosesAt(book.pendingFrom, loaded.graceHours))
    : null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      {safe && (
        <span
          className={
            closedThrough && !settlingFrom ? 'font-semibold text-success' : 'text-text-dim'
          }
        >
          {safe}
        </span>
      )}
      {estimateWords && !showStanding && (
        <span className="text-text-dim">
          {t(`miningTax.corpBook.sync.estimate${here}`, {
            ...estimateWords,
            amount: estimateWords.estimate,
          })}
        </span>
      )}
      {book.pendingFrom && closesAt && book.pendingFrom !== estimateFrom && (
        <span className="text-text-dim">
          {t(`miningTax.corpBook.sync.openDay${here}`, {
            date: shortDate(book.pendingFrom, i18n.language),
            time: closesAt.toISOString().slice(11, 16),
            closeDate: shortDate(utcDay(closesAt.getTime()), i18n.language),
            corp: corpName,
          })}
        </span>
      )}
      {standing && (
        <span className={account?.owes ? 'text-text' : 'text-text-dim'}>{standing}</span>
      )}
      {Math.abs(opening) >= 1 && (
        <span className="text-text-dim">
          {t(
            opening > 0
              ? `miningTax.corpBook.sync.openingOwes${here}`
              : `miningTax.corpBook.sync.openingCredit${here}`,
            {
              amount: formatIsk(Math.abs(opening), 0),
              corp: corpName,
            }
          )}
        </span>
      )}
      {credit && !account && (
        <span className="text-text-dim">
          {t(`miningTax.corpBook.sync.credit${here}`, {
            amount: formatIsk(summary.credit, 0),
            corp: corpName,
          })}
        </span>
      )}
    </p>
  );
}
