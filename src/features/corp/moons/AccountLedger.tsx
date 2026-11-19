import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataTableColumn } from '@/components/ui';
import {
  accountLedger,
  type LedgerEntry,
  type AccountLedger as Ledger,
} from '@/engine/corpTaxBook/accountLedger';
import type { MinerDetail } from '@/engine/corpTaxBook/bookView';
import type { Adjustment } from '@/engine/corpTaxBook/statements';
import { isk, shortDate } from './moonsFormat';
import { BookSection } from './sectionParts';

/**
 * A Miner's account in one list (an accountant's view): every day's tax and every payment,
 * write-off and correction in date order with the balance after each, newest first so the top
 * row is where the account stands now. The day and payment tables below stay as the detail.
 */
export function AccountLedger({
  detail,
  corrections,
  running,
  phone,
}: {
  detail: MinerDetail;
  corrections: readonly Adjustment[];
  running: boolean;
  phone: boolean;
}) {
  const { t } = useTranslation();
  const ledger: Ledger = useMemo(
    () => accountLedger(detail, corrections, running),
    [detail, corrections, running]
  );
  const rows = useMemo(() => [...ledger.entries].reverse(), [ledger]);

  const what = (e: LedgerEntry) => {
    switch (e.kind) {
      case 'day':
        return t('corpTaxBook.moons.ledger.what.day', { count: e.days ?? 1 });
      case 'payment':
        return t('corpTaxBook.moons.ledger.what.payment');
      case 'correction':
        return t('corpTaxBook.moons.ledger.what.correction', { reason: e.note });
      case 'writeOff':
        return t('corpTaxBook.moons.ledger.what.writeOff', { reason: e.note });
      case 'adjustment':
        return t('corpTaxBook.moons.ledger.what.adjustment');
    }
  };

  const columns: DataTableColumn<LedgerEntry>[] = [
    {
      id: 'date',
      header: t('corpTaxBook.moons.ledger.cols.date'),
      className: 'whitespace-nowrap',
      render: (e) => shortDate(e.date),
    },
    {
      id: 'what',
      header: t('corpTaxBook.moons.ledger.cols.what'),
      primary: true,
      render: (e) => what(e),
    },
    {
      id: 'debit',
      header: t('corpTaxBook.moons.ledger.cols.debit'),
      align: 'right',
      className: 'tabular-nums',
      render: (e) =>
        e.debit > 0 ? isk(e.debit) : phone ? null : <span className="text-text-faint">—</span>,
    },
    {
      id: 'credit',
      header: t('corpTaxBook.moons.ledger.cols.credit'),
      align: 'right',
      className: 'tabular-nums',
      render: (e) =>
        e.credit > 0 ? (
          <span className="text-isk-pos">{isk(e.credit)}</span>
        ) : phone ? null : (
          <span className="text-text-faint">—</span>
        ),
    },
    {
      id: 'balance',
      header: t('corpTaxBook.moons.ledger.cols.balance'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (e) => balanceText(e.balance),
    },
  ];

  const balanceText = (balance: number) =>
    Math.abs(balance) < 1 ? (
      <span className="text-text-dim">{isk(0)}</span>
    ) : balance > 0 ? (
      <span className="text-isk-neg">
        {isk(balance)}
        <span className="ml-1 text-xs text-text-dim">{t('corpTaxBook.moons.ledger.owed')}</span>
      </span>
    ) : (
      <span className="text-isk-pos">
        {isk(-balance)}
        <span className="ml-1 text-xs text-text-dim">{t('corpTaxBook.moons.ledger.credit')}</span>
      </span>
    );

  return (
    <BookSection
      title={t('corpTaxBook.moons.ledger.title')}
      noun={t('corpTaxBook.moons.sections.nouns.payments')}
      empty={t('corpTaxBook.moons.ledger.empty')}
      rows={rows}
      phone={phone}
      meta={<span className="text-xs text-text-dim">{t('corpTaxBook.moons.ledger.hint')}</span>}
      summary={t('corpTaxBook.moons.ledger.summary', {
        count: rows.length,
        balance: isk(Math.abs(ledger.balance)),
        side: ledger.balance > 0.5 ? 'owed' : ledger.balance < -0.5 ? 'credit' : 'even',
      })}
    >
      {(shown, table) => (
        <>
          <DataTable
            label={t('corpTaxBook.moons.ledger.title')}
            columns={columns}
            rows={[...shown]}
            rowKey={(e) => e.key}
            density="compact"
            stackLayout="dense"
            {...table}
          />
          {ledger.notYetBilled.days > 0 && (
            <p className="border-t border-line px-3 py-2 text-xs text-text-dim tabular-nums">
              {t('corpTaxBook.moons.ledger.notYetBilled', {
                count: ledger.notYetBilled.days,
                amount: isk(ledger.notYetBilled.tax),
              })}
            </p>
          )}
        </>
      )}
    </BookSection>
  );
}
