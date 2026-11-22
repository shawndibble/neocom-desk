import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ValueList, ValueRow, textActionClassName } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { DayAmount } from '@/engine/corpTaxBook/minerRunningAccount';
import type { PayeeLedgerRow } from '@/engine/miningTax/payeeLedger';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import { OreLink } from '../OreIcon';

const isk = (value: number) => `${formatIsk(value)} ISK`;

function Days({ title, days }: { title: string; days: readonly DayAmount[] }) {
  return (
    <div>
      <p className="text-xs text-text-dim">{title}</p>
      <ValueList variant="plain">
        {days.map((d) => (
          <ValueRow key={d.date} label={d.date} value={isk(d.amount)} />
        ))}
      </ValueList>
    </div>
  );
}

/** Several lines on one date as one day, oldest first. */
function byDate(lines: readonly { date: string; tax: number }[]): DayAmount[] {
  const sums = new Map<string, number>();
  for (const l of lines) sums.set(l.date, (sums.get(l.date) ?? 0) + l.tax);
  return [...sums]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));
}

/** What one ledger row was, opened under it (the row's expand-in-place, DESIGN.md §6c). */
export function LedgerRowDetail({
  row,
  typeNames,
  onUnlinkPayment,
  onLinkWalletPayment,
}: {
  row: PayeeLedgerRow;
  /** Given on a personal Payee's ledger: opens the wallet payments to link to this Payee. */
  onLinkWalletPayment?: (() => void) | undefined;
  typeNames?: ReadonlyMap<number, string> | undefined;
  /** Given on a personal Payee's ledger: unlinks this payment (a legacy link too). */
  onUnlinkPayment?: ((paymentId: string) => void) | undefined;
}) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) =>
    t(`miningTax.ledger.detail.${key}`, opts);
  return (
    <div className="max-w-md space-y-2 text-sm">
      {row.kind === 'charge' && (
        <>
          {row.held && <p className="text-warning">{t('miningTax.ledger.held')}</p>}
          {row.charge.reason && <p>{k('reason', { reason: row.charge.reason })}</p>}
          {row.charge.ore && row.charge.ore.length > 0 && (
            <ValueList variant="plain">
              {row.charge.ore.map((o) => (
                <ValueRow
                  key={o.typeId}
                  label={
                    <OreLink typeId={o.typeId}>
                      {typeNames?.get(o.typeId) ?? `#${o.typeId}`}
                    </OreLink>
                  }
                  value={formatCount(o.quantity)}
                />
              ))}
            </ValueList>
          )}
          {!row.held && !row.charge.reason && !row.charge.ore?.length && (
            <p className="text-text-dim">{k('noDetail')}</p>
          )}
        </>
      )}
      {row.kind === 'payment' && (
        <>
          {row.payment.via === 'marked' && (
            <>
              <p>{k('markedNoPayment')}</p>
              <p className="text-text-dim">{k('marked')}</p>
              {onLinkWalletPayment && row.paid > 0 && (
                <button
                  type="button"
                  className={textActionClassName()}
                  onClick={onLinkWalletPayment}
                >
                  {k('linkWalletPayment')}
                </button>
              )}
            </>
          )}
          {row.payment.via === 'recorded' && !row.payment.href && <p>{k('recordedWaits')}</p>}
          {(row.payment.via === 'journal' ||
            row.payment.via === 'contract' ||
            row.payment.via === 'legacy') &&
            row.payment.to && (
              <p>
                {k('sentTo', {
                  payee: row.payment.to,
                  amount: isk(row.payment.amount ?? row.paid),
                  date: row.payment.at.slice(0, 10),
                })}
              </p>
            )}
          {row.payment.source && <p>{k(`source.${row.payment.source}`)}</p>}
          {row.payment.notTax ? (
            <p className="text-warning">{k('notTax', { amount: isk(row.payment.notTax) })}</p>
          ) : null}
          {row.payment.note && <p>{k('note', { note: row.payment.note })}</p>}
          {row.days.length > 0 && <Days title={k('paidDays')} days={row.days} />}
          {row.credit > 0 && <p>{k('leftAsCredit', { amount: isk(row.credit) })}</p>}
          {row.payment.href && (
            <p>
              <Link to={row.payment.href} className={inlineLinkClassName}>
                {row.payment.via ? k('viewWalletEntry') : k('viewPayment')}
              </Link>
            </p>
          )}
          {onUnlinkPayment && (
            <div>
              <button
                type="button"
                className={textActionClassName()}
                onClick={() => onUnlinkPayment(row.payment.id)}
              >
                {t('miningTax.unlinkTransactionAction')}
              </button>
              <p className="text-xs text-text-dim">{k('unlinkHint')}</p>
            </div>
          )}
        </>
      )}
      {row.kind === 'writeOff' && (
        <>
          <p className="text-text-dim">{k(row.cause)}</p>
          {row.reason && <p>{k('reason', { reason: row.reason })}</p>}
          {row.days.length > 0 ? (
            <Days title={k('forgaveDays')} days={row.days} />
          ) : (
            <p className="text-text-dim">{k('nothingToForgive')}</p>
          )}
        </>
      )}
      {row.kind === 'opening' && <p className="text-text-dim">{k('opening')}</p>}
      {row.kind === 'notice' && (
        <>
          <Days title={k('listedDays')} days={byDate(row.notice.lines)} />
          <p className={row.standing.settled ? 'text-success' : 'text-danger'}>
            {row.standing.settled
              ? k('noticeSettled')
              : k('noticeRemaining', { amount: isk(row.standing.remaining) })}
          </p>
        </>
      )}
    </div>
  );
}
