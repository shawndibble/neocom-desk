import { useTranslation } from 'react-i18next';
import { dayClosesAt } from '@/engine/corpTaxBook/billable';
import { formatAge } from '@/lib/age';
import { formatIsk } from '@/lib/isk';
import { useTicker } from '@/lib/ticker';
import type { CorpBookViewBook } from './corpBookView';

/** "17 Oct": an EVE/UTC calendar date, day first as the book's wording prints it ("12 Jul is closed"). */
function shortDate(date: string, language: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(language === 'en' ? 'en-GB' : language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * D12's "Safe to pay" wording under the corp's balance card: until a sync after
 * the grace period the corp's record is not final ("Safe to pay once <Corp>
 * syncs (last synced 2d ago)"), then "Safe to pay — 12 Jul is closed". Also
 * credit on the next Statement and a leaver's note. A donation still waiting
 * for the corp to credit it is left unsaid: that is the corp's side to handle.
 */
export function CorpBookSyncNote({
  book,
  owedNow,
  now: nowOverride,
}: {
  book: CorpBookViewBook;
  /** What the book's rows owe right now. */
  owedNow: number;
  /** Test seam; the note reads the shared minute ticker otherwise. */
  now?: number;
}) {
  const ticked = useTicker(60_000);
  const now = nowOverride ?? ticked;
  const { t, i18n } = useTranslation();
  const { summary, corpName, loaded } = book;
  const synced = summary.lastSyncedAt;
  const ago = synced ? formatAge(Math.max(0, now - Date.parse(synced)), t) : null;
  const closedThrough = summary.closedThrough;
  const hasWords = owedNow > 0 || book.pendingFrom !== undefined || book.left || summary.credit > 0;
  if (!hasWords) return null;

  const safe =
    owedNow > 0 || book.pendingFrom !== undefined
      ? closedThrough
        ? t('miningTax.corpBook.sync.safe', {
            date: shortDate(closedThrough, i18n.language),
            corp: corpName,
            ago,
          })
        : synced
          ? t('miningTax.corpBook.sync.safeOnce', { corp: corpName, ago })
          : t('miningTax.corpBook.sync.neverSynced', { corp: corpName })
      : null;
  const closesAt = book.pendingFrom
    ? new Date(dayClosesAt(book.pendingFrom, loaded.graceHours))
    : null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      {safe && (
        <span className={closedThrough ? 'font-semibold text-success' : 'text-text-dim'}>
          {safe}
        </span>
      )}
      {book.pendingFrom && closesAt && (
        <span className="text-text-dim">
          {t('miningTax.corpBook.sync.openDay', {
            date: shortDate(book.pendingFrom, i18n.language),
            time: closesAt.toISOString().slice(11, 16),
            closeDate: shortDate(closesAt.toISOString().slice(0, 10), i18n.language),
            corp: corpName,
          })}
        </span>
      )}
      {summary.credit > 0 && (
        <span className="text-text-dim">
          {t('miningTax.corpBook.sync.credit', {
            amount: formatIsk(summary.credit, 0),
            corp: corpName,
          })}
        </span>
      )}
      {book.left && (
        <span className="text-text-dim">
          {t('miningTax.corpBook.sync.left', { corp: corpName })}
        </span>
      )}
    </p>
  );
}
