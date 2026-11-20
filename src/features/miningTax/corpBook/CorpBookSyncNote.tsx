import { useTranslation } from 'react-i18next';
import { dayClosesAt } from '@/engine/corpTaxBook/billable';
import { formatAge, MINUTE_MS } from '@/lib/age';
import { formatIsk } from '@/lib/isk';
import { useTicker } from '@/lib/ticker';
import type { CorpBookViewBook } from './corpBookView';
import { utcDay } from '@/engine/localDay';

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
 * credit on the next Statement; on a running account, paid through a day or how far behind, and
 * only true overpayment as "ahead". A corporation the member left says so in its own notice
 * (`LeftCorpNotice`), with Pay and Stop showing beside it. A donation still waiting
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
  const ticked = useTicker(MINUTE_MS);
  const now = nowOverride ?? ticked;
  const { t, i18n } = useTranslation();
  const { summary, corpName, loaded } = book;
  const synced = summary.lastSyncedAt;
  const ago = synced ? formatAge(Math.max(0, now - Date.parse(synced)), t) : null;
  const closedThrough = summary.closedThrough;
  // Shown on the Tax page and in the pay dialog alike (#6204): credit is money the member has.
  const credit = summary.credit > 0;
  // A running account (#6294) says where the member stands: paid through a day, or how far behind.
  const account = summary.account;
  const standing = account?.owes
    ? t('miningTax.corpBook.sync.behind', {
        amount: formatIsk(account.owes.amount, 0),
        count: account.owes.days,
        date: shortDate(account.owes.oldest, i18n.language),
        corp: corpName,
      })
    : null;
  // The balance an officer rolled over from another system, until they reverse it.
  // A note of where the account started, so it shows only while a balance is open: owing it, or
  // holding credit.
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
              ? 'miningTax.corpBook.sync.openingOwes'
              : 'miningTax.corpBook.sync.openingCredit',
            {
              amount: formatIsk(Math.abs(opening), 0),
              corp: corpName,
            }
          )}
        </span>
      )}
      {credit && !account && (
        <span className="text-text-dim">
          {t('miningTax.corpBook.sync.credit', {
            amount: formatIsk(summary.credit, 0),
            corp: corpName,
          })}
        </span>
      )}
    </p>
  );
}
