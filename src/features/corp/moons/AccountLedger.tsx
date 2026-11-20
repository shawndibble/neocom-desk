import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { oreTaxLines } from '@/engine/corpTaxBook/bookSections';
import { DataTable, type DataTableColumn } from '@/components/ui';
import {
  accountLedger,
  type LedgerEntry,
  type AccountLedger as Ledger,
} from '@/engine/corpTaxBook/accountLedger';
import type { MinerDetail } from '@/engine/corpTaxBook/bookView';
import type { Adjustment } from '@/engine/corpTaxBook/statements';
import { isk, shortDate } from './moonsFormat';
import { OreLinesTable } from './OreLinesTable';
import { extractionPath, refineryPath } from './moonsPaths';
import { paymentWalletHref } from './paymentWalletHref';
import { tapTargetClassName } from './sectionHelpers';
import { BookSection } from './sectionParts';
import { useBook } from './useBook';

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
  const { names } = useBook();
  const ledger: Ledger = useMemo(
    () => accountLedger(detail, corrections, running),
    [detail, corrections, running]
  );
  const rows = useMemo(() => [...ledger.entries].reverse(), [ledger]);

  const what = (e: LedgerEntry) => {
    switch (e.kind) {
      case 'day': {
        const keys = new Set(e.dayKeys);
        const places = new Map<number, string | undefined>();
        for (const d of detail.days)
          if (keys.has(d.key))
            places.set(d.structureId, places.get(d.structureId) ?? d.extractionId);
        return (
          <span>
            {t('corpTaxBook.moons.ledger.what.day')}
            {[...places].map(([structureId, extractionId]) => (
              <span key={structureId} className="block text-xs">
                <Link
                  to={
                    extractionId === undefined
                      ? refineryPath(structureId)
                      : extractionPath(extractionId)
                  }
                  className={entityLinkClassName(tapTargetClassName)}
                >
                  {names.refinery(structureId)}
                </Link>
              </span>
            ))}
          </span>
        );
      }
      case 'payment': {
        const href = e.paymentId ? paymentWalletHref(e.paymentId) : null;
        const p = detail.payments.find((x) => x.id === e.paymentId);
        const label = p
          ? t('corpTaxBook.moons.ledger.what.paymentFrom', { name: names.character(p.characterId) })
          : t('corpTaxBook.moons.ledger.what.payment');
        return href ? (
          <Link to={href} className={entityLinkClassName(tapTargetClassName)}>
            {label}
          </Link>
        ) : (
          label
        );
      }
      case 'correction':
        return t('corpTaxBook.moons.ledger.what.correction', { reason: e.note });
      case 'writeOff':
        return t('corpTaxBook.moons.ledger.what.writeOff', { reason: e.note });
      case 'tolerance':
        return t('corpTaxBook.moons.ledger.what.tolerance');
    }
  };

  const detailOf = (e: LedgerEntry) => {
    if (e.kind === 'day') {
      const keys = new Set(e.dayKeys);
      return (
        <OreLinesTable
          lines={oreTaxLines(detail.days.filter((d) => keys.has(d.key)))}
          label={t('corpTaxBook.moons.ledger.oreOf', { date: shortDate(e.date) })}
        />
      );
    }
    if (e.kind === 'payment') {
      const p = detail.payments.find((x) => x.id === e.paymentId);
      const href = e.paymentId ? paymentWalletHref(e.paymentId) : null;
      return (
        <div className="space-y-1 px-3 py-2 text-sm">
          {p && (
            <p>
              {t('corpTaxBook.moons.ledger.paidBy', {
                name: names.character(p.characterId),
                source: t(`corpTaxBook.moons.payment.${p.source}`),
              })}
            </p>
          )}
          {!href && <p className="text-text-dim">{t('corpTaxBook.moons.ledger.noWalletEntry')}</p>}
        </div>
      );
    }
    return (
      <p className="px-3 py-2 text-sm text-text-dim">
        {e.kind === 'tolerance'
          ? t(
              // `note` is the mined day a running account's row closes; a Statement's has none and
              // is always paid after it is issued.
              e.note !== undefined && e.date <= e.note
                ? 'corpTaxBook.moons.ledger.toleranceNote'
                : 'corpTaxBook.moons.ledger.toleranceNoteLater'
            )
          : e.note}
      </p>
    );
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

  // A minus is what the Miner owes; a plain figure is credit they hold with the book.
  const balanceText = (balance: number) =>
    Math.abs(balance) < 1 ? (
      <span className="text-text-dim">{isk(0)}</span>
    ) : balance > 0 ? (
      <span className="text-isk-neg">{`\u2212${isk(balance)}`}</span>
    ) : (
      <span className="text-isk-pos">{isk(-balance)}</span>
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
        side: t(
          `corpTaxBook.moons.ledger.${ledger.balance > 0.5 ? 'owed' : ledger.balance < -0.5 ? 'credit' : 'even'}`
        ),
      })}
    >
      {(shown, table) => (
        <>
          <DataTable
            label={t('corpTaxBook.moons.ledger.title')}
            columns={columns}
            rows={[...shown]}
            rowKey={(e) => e.key}
            expandableRow={{ leadingIcon: true, renderDetail: detailOf }}
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
