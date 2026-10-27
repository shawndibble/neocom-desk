import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { typeLabel } from './typeLabel';
import { hubForPayee } from '../pricing';
import { formatCount } from '@/lib/formatCount';

interface Props {
  open: boolean;
  onClose: () => void;
  view: BookRowView;
  systemName: string;
  typeNames: ReadonlyMap<number, string>;
}

const quantityOf = (
  lines: readonly { typeId: number; quantity: number }[] | undefined,
  id: number
) => lines?.find((l) => l.typeId === id)?.quantity;

/**
 * "Compare with the book" (D28): the member's own record next to the book's,
 * with what differs marked — quantity, rate and the tax that follows. Opens
 * from the row detail, never inline.
 */
export function CorpBookDiffModal({ open, onClose, view, systemName, typeNames }: Props) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const dispute = view.dispute;
  const hub = hubForPayee(view.hubId);
  const form = t(
    view.oreForm === 'compressed'
      ? 'miningTax.detail.breakdown.compressed'
      : 'miningTax.detail.breakdown.raw'
  );
  const personalPct = dispute?.personalPct;
  const personalTax =
    personalPct === undefined || !view.personalOreLines
      ? undefined
      : view.oreLines.reduce(
          (sum, l) =>
            sum +
            (quantityOf(view.personalOreLines, l.typeId) ?? 0) *
              (view.unitPrices[l.typeId] ?? 0) *
              (personalPct / 100),
          0
        );
  const bookTax = view.billed;

  const cell = (differs: boolean) => cx('text-right tabular-nums', differs && 'font-semibold');
  const differs = (
    <span className="ml-1.5 text-[0.6875rem] font-semibold tracking-wider text-warning uppercase">
      {t('miningTax.corpBook.diff.differs')}
    </span>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement={isPhone ? 'sheet' : 'center'}
      title={t('miningTax.corpBook.diff.title', { date: view.date.slice(5) })}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">
          {view.date} · {systemName} · {hub.name}
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className={eyebrowClassName}>
              <th className="py-1 text-left" />
              <th className="py-1 text-right">{t('miningTax.corpBook.diff.you')}</th>
              <th className="py-1 text-right">{t('miningTax.corpBook.diff.book')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {view.oreLines.map((line) => {
              const you = quantityOf(view.personalOreLines, line.typeId);
              const differsHere = you !== line.quantity;
              return (
                <tr key={line.typeId}>
                  <td className="py-1.5">
                    {t('miningTax.corpBook.diff.quantity', {
                      ore: typeLabel(typeNames, line.typeId),
                    })}
                  </td>
                  <td className={cell(false)}>{you === undefined ? '—' : formatCount(you)}</td>
                  <td className={cell(differsHere)}>
                    {formatCount(line.quantity)}
                    {differsHere && differs}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="py-1.5">{t('miningTax.corpBook.diff.priceBasis')}</td>
              <td className={cell(false)} colSpan={2}>
                {t('miningTax.corpBook.diff.basis', { hub: hub.name, form })}
              </td>
            </tr>
            <tr>
              <td className="py-1.5">{t('miningTax.corpBook.diff.rate')}</td>
              <td className={cell(false)}>{personalPct === undefined ? '—' : `${personalPct}%`}</td>
              <td className={cell(Boolean(dispute?.rate))}>
                {view.taxPct}%{dispute?.rate && differs}
              </td>
            </tr>
            <tr>
              <td className="py-1.5">{t('miningTax.corpBook.diff.tax')}</td>
              <td className={cell(false)}>
                {personalTax === undefined ? '—' : formatIsk(personalTax, 0)}
              </td>
              <td
                className={cell(
                  personalTax !== undefined && Math.round(personalTax) !== Math.round(bookTax)
                )}
              >
                {formatIsk(bookTax, 0)}
              </td>
            </tr>
          </tbody>
        </table>
        {dispute && (
          <p className="font-semibold text-warning">
            {dispute.rate && !dispute.quantity
              ? t('miningTax.corpBook.disputed.rate', {
                  you: dispute.personalPct,
                  book: dispute.bookPct,
                })
              : dispute.quantity && !dispute.rate
                ? t('miningTax.corpBook.disputed.quantity', {
                    you: formatCount(dispute.personalQuantity),
                    book: formatCount(dispute.bookQuantity),
                  })
                : t('miningTax.corpBook.disputed.both')}
          </p>
        )}
        <p className="text-xs text-text-dim">
          {t('miningTax.corpBook.diff.explain', {
            pct: view.taxPct,
            scope: t(`miningTax.corpBook.rateScope.${view.rateScope}`),
            from: view.rateEffectiveFrom ?? view.date,
            date: view.date,
            corp: view.corpName,
          })}
        </p>
      </div>
    </Modal>
  );
}
