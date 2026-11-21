import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useOpenAfterMenu } from '@/components/ui';
import { inRange } from '@/engine/corpTaxBook/bookSections';
import { minerLedgerSource } from '@/engine/corpTaxBook/minerLedgerSource';
import { minerAccountOf, type MinerDetail } from '@/engine/corpTaxBook/bookView';
import { payeeLedger, type PayeeLedgerRow } from '@/engine/miningTax/payeeLedger';
import { PayeeLedgerTable } from '@/features/miningTax/ledger/PayeeLedgerPanel';
import { canOverrideDay } from './dayEligibility';
import { LedgerRowMenu, type LedgerActions } from './LedgerRowMenu';
import { paymentWalletHref } from './paymentWalletHref';
import { isk, shortDate } from './moonsFormat';
import { BookSection } from './sectionParts';
import { useBook } from './useBook';

/**
 * A Miner's account as the one Payee ledger (decision 20261120-235011, "A Payee ledger"): the
 * same rows a pilot reads of their own account, owed positive, newest first so the top row is
 * where the account stands now, each with what an officer can change on it.
 */
export function MinerLedger({
  minerId,
  detail,
  phone,
  actions,
  from,
}: {
  minerId: string;
  detail: MinerDetail;
  phone: boolean;
  /** What a row's menu opens; without it the rows have no menu. */
  actions?: LedgerActions;
  /** The first UTC day the page's range takes in; earlier rows hide (the balance keeps them). */
  from?: string;
}) {
  const { t } = useTranslation();
  const { view, names } = useBook();
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const ledger = useMemo(() => {
    const miner = minerAccountOf(view, minerId);
    if (!miner) return null;
    const dayOfLine = new Map(detail.days.map((d) => [d.key, d]));
    return payeeLedger(
      minerLedgerSource(miner, view.input, {
        character: names.character,
        place: (l) => {
          const d = dayOfLine.get(l.key);
          if (d?.moonId !== undefined) return names.moon(d.moonId);
          return l.structureId === undefined ? undefined : names.refinery(l.structureId);
        },
        walletHref: (id) => paymentWalletHref(id) ?? undefined,
      })
    );
  }, [view, minerId, detail.days, names]);
  const rows = useMemo(
    () =>
      [...(ledger?.rows ?? [])]
        .filter((r) => r.kind === 'opening' || inRange(r.date, from))
        .reverse(),
    [ledger, from]
  );
  const typeNames = useMemo(() => {
    const out = new Map<number, string>();
    for (const d of detail.days) for (const l of d.oreLines) out.set(l.typeId, names.ore(l.typeId));
    return out;
  }, [detail.days, names]);
  // Each opens its dialog once the menu has closed, so focus lands in the dialog.
  const opened: LedgerActions | undefined = actions && {
    editCorrection: (id) => run(() => actions.editCorrection(id)),
    reverseCorrection: (id) => run(() => actions.reverseCorrection(id)),
    reverseWriteOff: (id) => run(() => actions.reverseWriteOff(id)),
    chargeShortfall: (d) => run(() => actions.chargeShortfall(d)),
    changeForgiven: (d) => run(() => actions.changeForgiven(d)),
    markNotTax: (id) => run(() => actions.markNotTax(id)),
    reassignPayment: (id) => run(() => actions.reassignPayment(id)),
    changeRate: (key) => run(() => actions.changeRate(key)),
    dismissDays: (keys) => run(() => actions.dismissDays(keys)),
  };
  /** A mined row's day, with its status: what can still be changed on it. */
  const dayOf = (r: PayeeLedgerRow) =>
    r.kind === 'charge' && r.charge.kind === 'mined'
      ? detail.days.filter((d) => d.key === r.charge.id)
      : [];
  const balance = ledger?.rows.at(-1)?.balance ?? 0;
  const held = rows.filter((r) => r.kind === 'charge' && r.held);
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
        balance: isk(Math.abs(balance)),
        side: t(
          `corpTaxBook.moons.ledger.${balance > 0.5 ? 'owed' : balance < -0.5 ? 'credit' : 'even'}`
        ),
      })}
    >
      {(shown, table) => (
        <>
          <PayeeLedgerTable
            label={t('corpTaxBook.moons.ledger.title')}
            rows={shown}
            typeNames={typeNames}
            density="compact"
            stackLayout="dense"
            {...table}
            {...(opened
              ? {
                  rowContextMenu: (r: PayeeLedgerRow, tr: ReactElement) => (
                    <LedgerRowMenu
                      entry={r}
                      actions={opened}
                      name={`${shortDate(r.date)} ${r.kind}`}
                      rateDays={dayOf(r)
                        .filter((d) => canOverrideDay(d, view.input.now))
                        .map((d) => d.key)}
                      dismissDays={dayOf(r)
                        .filter((d) => d.status === 'owed')
                        .map((d) => d.key)}
                      onCloseAutoFocus={onCloseAutoFocus}
                    >
                      {tr}
                    </LedgerRowMenu>
                  ),
                }
              : {})}
          />
          {held.length > 0 && (
            <p className="border-t border-line px-3 py-2 text-xs text-text-dim tabular-nums">
              {t('corpTaxBook.moons.ledger.heldByDispute', {
                count: held.length,
                amount: isk(held.reduce((s, r) => s + r.charged, 0)),
              })}
            </p>
          )}
          {ledger && ledger.notYetBilled.days > 0 && (
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
