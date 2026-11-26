import { useTranslation } from 'react-i18next';
import { Button, plainTextActionClassName } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import type { LeftCorpBook } from './leftCorpBooks';

const textAction = plainTextActionClassName('min-h-9 md:min-h-6');

export function LeftCorpNotice({
  book,
  onPay,
  onStopShowing,
}: {
  book: LeftCorpBook;
  onPay: (corporationId: number) => void;
  onStopShowing: (corporationId: number) => void;
}) {
  const { t } = useTranslation();
  const { corporationId, corpName, owed } = book;
  const amount = formatIsk(owed, 0);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xs border border-line bg-panel-2 px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-72">
        <p className="text-sm font-semibold">
          {t('miningTax.corpBook.leftCorp.title', { corp: corpName })}
        </p>
        <p className="text-xs text-text-dim">
          {owed > 0
            ? t('miningTax.corpBook.leftCorp.owed', { amount })
            : t('miningTax.corpBook.leftCorp.settled')}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {owed > 0 && (
          <Button size="sm" onClick={() => onPay(corporationId)}>
            {t('miningTax.corpBook.leftCorp.pay', { amount })}
          </Button>
        )}
        <button type="button" className={textAction} onClick={() => onStopShowing(corporationId)}>
          {t('miningTax.corpBook.leftCorp.stop', { corp: corpName })}
        </button>
      </div>
    </div>
  );
}

export function LeftCorpNotices({
  books,
  hidden,
  onPay,
  onStopShowing,
  onShow,
}: {
  books: readonly LeftCorpBook[];
  hidden: readonly { corporationId: number; corpName: string }[];
  onPay: (corporationId: number) => void;
  onStopShowing: (corporationId: number) => void;
  onShow: (corporationId: number) => void;
}) {
  const { t } = useTranslation();
  if (books.length === 0 && hidden.length === 0) return null;
  return (
    <div className="space-y-2">
      {books.map((book) => (
        <LeftCorpNotice
          key={book.corporationId}
          book={book}
          onPay={onPay}
          onStopShowing={onStopShowing}
        />
      ))}
      {hidden.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-xs text-text-dim">
          {hidden.map((h) => (
            <span key={h.corporationId}>
              {t('miningTax.corpBook.leftCorp.hidden', { corps: h.corpName })} ·{' '}
              <button
                type="button"
                className={textAction}
                aria-label={t('miningTax.corpBook.leftCorp.showLabel', { corp: h.corpName })}
                onClick={() => onShow(h.corporationId)}
              >
                {t('miningTax.corpBook.leftCorp.show', { corp: h.corpName })}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
