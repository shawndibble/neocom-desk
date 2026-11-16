/**
 * Where a payment to a Corp Tax Book goes (docs/design/mockups/mining-tax-resolve): the book
 * pays the oldest days first and knows no finer target, so the pilot pays an amount and the
 * dialog shows which days it pays — and skips a day held by an open dispute or "Not paying".
 */
import { Button, IskInput, Modal, Panel } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { NewComponent } from './NewComponent';
import { BUH, OPEN_DAYS, PAYING, PILOT, RATE_DAY, isk } from './miningTaxResolveFixtures';
import { QueueCard } from './miningTaxResolveParts';

const noop = () => {};

/** Each open day and what this amount does to it, oldest first, holds skipped. */
function wherePaymentGoes(amount: number) {
  let left = amount;
  return OPEN_DAYS.map((day) => {
    if ('held' in day) return { ...day, result: 'held' as const };
    if (left >= day.tax) {
      left -= day.tax;
      return { ...day, result: 'paid' as const };
    }
    const result = left > 0 ? ('part' as const) : ('next' as const);
    left = 0;
    return { ...day, result };
  });
}

export function PayOldestFirstDialog() {
  const rows = wherePaymentGoes(PAYING);
  const owed = OPEN_DAYS.reduce((sum, d) => sum + d.tax, 0);
  return (
    <Modal
      open
      onClose={noop}
      title={`Pay ${BUH.name}`}
      placement="medium"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary">Open in EVE · {isk(PAYING)}</Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-text-dim">
          {isk(owed)} open. {BUH.name}&apos;s book pays your oldest days first — a payment
          can&apos;t pick a moon or a day, so this shows where yours lands.
        </p>
        <label className="block max-w-xs space-y-1">
          <span className="text-sm font-semibold">Amount</span>
          <IskInput value={String(PAYING)} onChange={noop} />
        </label>
        <NewComponent name="WherePaymentGoes">
          <ul className="divide-y divide-line text-sm">
            {rows.map((row) => (
              <li key={row.date} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                <span className="w-24 tabular-nums">{row.date}</span>
                <span className="w-32 text-right tabular-nums">{isk(row.tax)}</span>
                {row.result === 'paid' && <Pill tone="success">Paid by this</Pill>}
                {row.result === 'part' && <Pill tone="accent">Part paid</Pill>}
                {row.result === 'next' && (
                  <span className="text-xs text-text-dim">Next in line</span>
                )}
                {row.result === 'held' && (
                  <>
                    <Pill tone="neutral">Held</Pill>
                    <span className="text-xs text-text-dim">{row.held}; no payment lands here</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </NewComponent>
      </div>
    </Modal>
  );
}

/** The officer's card says where the member's money went, and what is held. */
export function OfficerHeldDay() {
  return (
    <Panel title="Needs you · 1" padded={false}>
      <ul>
        <QueueCard
          newName="QueueCard: where it landed"
          tone="neutral"
          title={`${PILOT} isn't paying ${RATE_DAY.date} · ${isk(RATE_DAY.bookTax)}`}
          body={`“The fleet boss said this op was untaxed.” Their ${isk(PAYING)} on 16 Nov paid 2026-10-29 and 2026-10-30; ${RATE_DAY.date} is held until you answer.`}
          primary="Write off"
          secondary="Keep the bill"
        />
      </ul>
    </Panel>
  );
}
