import { useMemo, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { oreTaxLines } from '@/engine/corpTaxBook/bookSections';
import { DataTable, useOpenAfterMenu, type DataTableColumn } from '@/components/ui';
import {
  accountLedger,
  type LedgerEntry,
  type AccountLedger as Ledger,
} from '@/engine/corpTaxBook/accountLedger';
import type { MinerDetail } from '@/engine/corpTaxBook/bookView';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import { canOverrideDay } from './dayEligibility';
import { LedgerRowMenu, type LedgerActions } from './LedgerRowMenu';
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
  phone,
  actions,
}: {
  detail: MinerDetail;
  corrections: readonly Adjustment[];
  phone: boolean;
  /** What a row's menu opens; without it the rows have no menu. */
  actions?: LedgerActions;
}) {
  const { t } = useTranslation();
  const { names } = useBook();
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  // Each opens its dialog once the menu has closed, so focus lands in the dialog.
  const opened: LedgerActions | undefined = actions && {
    editCorrection: (id) => run(() => actions.editCorrection(id)),
    reverseCorrection: (id) => run(() => actions.reverseCorrection(id)),
    reverseWriteOff: (id) => run(() => actions.reverseWriteOff(id)),
    chargeShortfall: (e) => run(() => actions.chargeShortfall(e)),
    changeForgiven: (e) => run(() => actions.changeForgiven(e)),
    markNotTax: (id) => run(() => actions.markNotTax(id)),
    changeRate: (key) => run(() => actions.changeRate(key)),
    dismissDays: (keys) => run(() => actions.dismissDays(keys)),
  };
  const ledger: Ledger = useMemo(() => accountLedger(detail, corrections), [detail, corrections]);
  const rows = useMemo(() => [...ledger.entries].reverse(), [ledger]);

  /** The mined days behind a day row, with their status: what can still be changed on them. */
  const daysOf = (e: LedgerEntry) => {
    const keys = new Set(e.dayKeys);
    return detail.days.filter((d) => keys.has(d.key));
  };

  /** A record an officer undid keeps its row, struck through and tagged; its reversal says why. */
  const undone = (e: LedgerEntry, label: string) =>
    e.reversal ? (
      t('corpTaxBook.moons.ledger.what.reversal', { reason: e.note })
    ) : e.reversed ? (
      <span>
        <span className="text-text-dim line-through decoration-text-faint">{label}</span>{' '}
        <span className="text-xs text-text-dim">
          {t('corpTaxBook.moons.ledger.what.reversedTag')}
        </span>
      </span>
    ) : (
      label
    );

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
        return undone(
          e,
          e.opening
            ? t('corpTaxBook.moons.ledger.what.opening', { reason: e.note })
            : t('corpTaxBook.moons.ledger.what.correction', { reason: e.note })
        );
      case 'writeOff':
        return undone(e, t('corpTaxBook.moons.ledger.what.writeOff', { reason: e.note }));
      case 'tolerance':
        return t('corpTaxBook.moons.ledger.what.tolerance');
      case 'checkpoint':
        return t('corpTaxBook.moons.ledger.what.checkpoint');
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
            {...(opened
              ? {
                  rowMoreActions: true,
                  rowContextMenu: (e: LedgerEntry, tr: ReactElement) => (
                    <LedgerRowMenu
                      entry={e}
                      actions={opened}
                      name={`${shortDate(e.date)} ${e.kind}`}
                      rateDays={daysOf(e)
                        .filter(canOverrideDay)
                        .map((d) => d.key)}
                      dismissDays={daysOf(e)
                        .filter((d) => d.status === 'owed' || d.status === 'not-billable')
                        .map((d) => d.key)}
                      onCloseAutoFocus={onCloseAutoFocus}
                    >
                      {tr}
                    </LedgerRowMenu>
                  ),
                }
              : {})}
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
