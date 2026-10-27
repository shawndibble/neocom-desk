import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { CorpBookSyncNote } from './CorpBookSyncNote';
import type { CorpBookViewBook } from './corpBookView';

interface Props {
  open: boolean;
  onClose: () => void;
  book: CorpBookViewBook;
  /** What the book's rows owe right now. */
  owed: number;
  /** Codes of the open Statements: a code in the donation reason pins it to one. */
  statementCodes: readonly { code: string; period: string }[];
}

const FIELD_LABEL = eyebrowClassName;

/**
 * "Settle up" for the corp Payee. Unlike a personal Payee, nothing is recorded
 * here: the corp's book finds the donation in its own wallet journal and
 * credits it, so this only says what to send, where, and whether it is safe to
 * send yet (D12). The app cannot move ISK.
 */
export function CorpPayDialog({ open, onClose, book, owed, statementCodes }: Props) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [copied, setCopied] = useState<string | null>(null);
  const whole = Math.ceil(owed);
  const division = book.loaded.divisions[0] ?? 1;
  const copy = (id: string, text: string) => {
    void writeToClipboard(text);
    setCopied(id);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      placement={isPhone ? 'sheet' : 'center'}
      title={t('miningTax.corpBook.pay.title', { corp: book.corpName })}
    >
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <p className={FIELD_LABEL}>{t('miningTax.corpBook.pay.amount')}</p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-isk-neg tabular-nums">
              {formatIsk(whole, 0)} ISK
            </span>
            <Button size="sm" onClick={() => copy('amount', String(whole))}>
              {t('miningTax.corpBook.pay.copy')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-text-dim">
          {t('miningTax.corpBook.pay.how', { corp: book.corpName, division })}
        </p>
        {statementCodes.length > 0 ? (
          <ul className="space-y-1 text-xs text-text-dim">
            {statementCodes.map((s) => (
              <li key={s.code} className="flex flex-wrap items-center gap-2">
                <span>{t('miningTax.corpBook.pay.code', { period: s.period })}</span>
                <span className="font-mono text-text">{s.code}</span>
                <Button size="sm" onClick={() => copy(s.code, s.code)}>
                  {t('miningTax.corpBook.pay.copy')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-dim">{t('miningTax.corpBook.pay.noCode')}</p>
        )}
        <CorpBookSyncNote book={book} owedNow={owed} />
        {copied && (
          <p role="status" className="text-xs text-text-dim">
            {t('miningTax.corpBook.pay.copied')}
          </p>
        )}
        <div className="flex justify-end pt-1">
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      </div>
    </Modal>
  );
}
