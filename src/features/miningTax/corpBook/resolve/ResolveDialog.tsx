import { useState, type ReactNode } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { dateTimeAt } from '@/features/corp/moons/moonsFormat';
import { formatList } from '@/lib/listFormat';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Modal, Radio, TextArea } from '@/components/ui';
import { selectedRowClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { InlineError } from '@/components/ui/InlineError';
import { Pill } from '@/components/ui/Pill';
import { disputeHold } from '@/engine/corpTaxBook/disputes';
import type { ClaimCheck, ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { IskText } from '../../IskText';
import type { MadePayment } from '../../paymentLinks';
import type { TaxQuestionMailOutcome } from '../sendTaxQuestionMail';
import { isoDay } from '../memberFlag';
import { CHECK_TONE } from './checkTone';
import { TransferPicker } from './TransferPicker';
import { outcomesFor, SELF_SERVICE, type OutcomeId, type ResolveProblem } from './outcomes';
import {
  countHeldDonations,
  sendProof,
  tellNotOwed,
  tellNotPaying,
  type MailContext,
} from './resolveSubmit';
import { DialogFooter } from '@/components/ui/DialogFooter';

const k = (key: string) => `miningTax.resolve.${key}`;

interface Props {
  problem: ResolveProblem;
  /** Who is asking, and who answers tax questions for the book. */
  mail: MailContext;
  /** The member's own journal transfers that make the "I already paid" proof, when already known. */
  transfers?: ClaimedTransfer[];
  /** Every payment the member made from their wallet: "Which payment was it?" lists the ones around the billed period. */
  payments?: readonly MadePayment[];
  /**
   * The Characters whose payments the server accepts as proof for the Statement: the picker lists
   * only theirs. Absent: every payment given.
   */
  senderIds?: readonly number[];
  /** The billed period's first day (ISO): payments before it are not listed. */
  paidSince?: string;
  /** The Payee the member's own entry gave a Conflict day's ore to. */
  payeeName?: string;
  /** The facts above the choices: what the app knows about the problem. */
  facts: ReactNode;
  /** The key "Not paying" hides this problem under. */
  hideKey: string;
  onHide: (key: string) => Promise<unknown>;
  /** Pay it: the book's own pay flow. */
  onPay: () => void;
  /** Fix my records: the day, on its takeover. */
  onFixRecords?: () => void;
  /** Something reached the book: read it again. */
  onSent: () => void;
  onClose: () => void;
}

type Done =
  | { kind: 'hidden' }
  | {
      kind: 'sent';
      checks?: ClaimCheck[];
      /** The transfers that went with it, in the order `checks` answers them. */
      transfers?: readonly ClaimedTransfer[];
      confirmed?: boolean;
      holdsUntil?: string;
      /** Said again after an officer kept the bill: the day is not held a second time. */
      again?: boolean;
      /** Donations the book held for review, counted by the member's own claim. */
      held?: boolean;
      mailed?: TaxQuestionMailOutcome;
    };

/**
 * One problem on the Tax tab and every way out of it (resolving in the app, mockup B): settle it
 * yourself — pay it, fix my records, not paying — or ask the corporation — I already paid, I don't
 * owe this. Only what applies, self-service first, the likeliest preselected; the chosen one opens
 * its own inputs, and what was done is said before the dialog closes.
 */
export function ResolveDialog({
  problem,
  mail,
  transfers: presetTransfers = [],
  payments: allPayments,
  senderIds,
  paidSince,
  payeeName,
  facts,
  hideKey,
  onHide,
  onPay,
  onFixRecords,
  onSent,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const offer = outcomesFor(problem);
  const [choice, setChoice] = useState<OutcomeId>(offer.preselected);
  const [tell, setTell] = useState(false);
  const [text, setText] = useState('');
  // The server only counts a payment from a Character on the Statement.
  const payments = senderIds
    ? allPayments?.filter((p) => senderIds.includes(p.characterId))
    : allPayments;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [pickedTransfers, setPickedTransfers] = useState<ClaimedTransfer[]>([]);
  // Transfers the app already knows (the donations it could not credit) are the proof as they
  // stand; otherwise the member picks which of their own payments it was.
  const transfers = presetTransfers.length > 0 ? presetTransfers : pickedTransfers;
  const picking = presetTransfers.length === 0 && payments !== undefined;
  const corp = problem.corpName;
  const row = problem.row;
  const statementId =
    problem.kind === 'uncredited' ||
    problem.kind === 'kept' ||
    problem.kind === 'overdue' ||
    problem.kind === 'markedPaid'
      ? problem.statementId
      : undefined;
  // Donations the book holds for review: without a Statement to declare on, each is claimed.
  const held = problem.kind === 'uncredited' ? problem.held : undefined;
  const countsHeld = held !== undefined && statementId === undefined;

  const needsText =
    choice === 'notOwed' ? problem.kind !== 'conflict' : choice === 'notPaying' && tell;
  const blocked =
    busy ||
    (needsText && text.trim() === '') ||
    (choice === 'paid' && (offer.noStatement || (statementId === undefined && !countsHeld))) ||
    (choice === 'fixRecords' && !onFixRecords);

  const holdsUntil = () => {
    const now = new Date().toISOString();
    return disputeHold({ at: now }, now)?.until ?? now;
  };

  const submit = async () => {
    if (choice === 'pay') return onPay();
    if (choice === 'fixRecords') return onFixRecords?.();
    setBusy(true);
    setError(false);
    try {
      if (choice === 'notPaying') {
        const mailed = tell && row ? await tellNotPaying(mail, row, text.trim()) : undefined;
        await onHide(hideKey);
        if (mailed) onSent();
        setDone(mailed ? { kind: 'sent', mailed, holdsUntil: holdsUntil() } : { kind: 'hidden' });
      } else if (choice === 'notOwed' && row) {
        const mailed = await tellNotOwed(mail, row, text.trim(), payeeName);
        onSent();
        setDone({
          kind: 'sent',
          mailed,
          holdsUntil: holdsUntil(),
          ...(problem.kind === 'kept' ? { again: true } : {}),
        });
      } else if (choice === 'paid' && countsHeld) {
        await countHeldDonations(mail, held);
        onSent();
        setDone({ kind: 'sent', confirmed: true, held: true });
      } else if (choice === 'paid' && statementId) {
        // Every day the proof covers, not just the first: the officer reads what it paid.
        const days =
          problem.kind === 'uncredited' && problem.days
            ? problem.days.join(', ')
            : problem.kind === 'overdue'
              ? problem.period
              : (row?.date ?? '');
        const out = await sendProof(mail, statementId, transfers, text.trim(), days);
        onSent();
        setDone({ kind: 'sent', ...out, transfers });
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const title =
    problem.kind === 'uncredited'
      ? t(k(held ? 'title.inReview' : 'title.uncredited'))
      : problem.kind === 'conflict'
        ? t(k('title.conflict'), { date: row?.date ?? '' })
        : problem.kind === 'kept'
          ? t(k('title.kept'), { corp })
          : problem.kind === 'overdue'
            ? t(k('title.overdue'), { corp, period: problem.period })
            : problem.kind === 'markedPaid'
              ? t(k('title.markedPaid'), { date: row?.date ?? '', corp })
              : problem.kind === 'billed'
                ? t(k('title.billed'), { date: row?.date ?? '', corp })
                : t(k('title.figure'), { date: row?.date ?? '' });

  if (done) {
    return (
      <Modal
        open
        onClose={onClose}
        title={title}
        placement="medium"
        footer={
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              {t(k('done'))}
            </Button>
          </div>
        }
      >
        <DoneView done={done} corp={corp} />
      </Modal>
    );
  }

  const choiceView = (id: OutcomeId) => {
    const checked = choice === id;
    // Only the radio, its title and its hint are the label: the chosen outcome's own inputs sit
    // beside it, so each keeps its own name and the radio's name stays the outcome.
    return (
      <div
        key={id}
        aria-current={checked ? 'true' : undefined}
        className={cx(
          'rounded-xs border border-line p-2.5',
          checked ? selectedRowClassName : 'border-l-2 border-l-transparent'
        )}
      >
        <label className={cx('flex cursor-pointer items-start gap-2', tappableRowClassName)}>
          <Radio
            name="resolve-outcome"
            checked={checked}
            onChange={() => setChoice(id)}
            className="mt-0.5"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {t(k(`outcome.${id}.title`), {
                corp,
                payee: payeeName ?? '',
                amount: formatIsk(
                  problem.kind === 'uncredited'
                    ? problem.amount
                    : problem.kind === 'markedPaid'
                      ? (row?.bookOwed ?? 0)
                      : (row?.taxOwed ?? row?.billed ?? 0),
                  0
                ),
                context: outcomeContext(problem.kind, id),
              })}
            </span>
            <span className="block text-xs text-text-dim">
              {t(k(`outcome.${id}.hint`), {
                corp,
                payee: payeeName ?? '',
                context: outcomeContext(problem.kind, id),
              })}
            </span>
          </span>
        </label>
        {checked && <div className="mt-2 space-y-2 pl-6">{inputsFor(id)}</div>}
      </div>
    );
  };

  const sendsTo = <span className="block text-xs text-text-dim">{t(k('sendsTo'), { corp })}</span>;

  const inputsFor = (id: OutcomeId): ReactNode => {
    switch (id) {
      case 'notPaying':
        return (
          <>
            {offer.tellWhy && (
              <label
                className={cx(
                  'flex cursor-pointer items-center gap-2 text-sm',
                  tappableRowClassName
                )}
              >
                <Checkbox checked={tell} onChange={(e) => setTell(e.target.checked)} />
                {t(k('tellWhy'), { corp })}
              </label>
            )}
            {tell && (
              <TextArea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label={t(k('whyLabel'))}
                placeholder={t(k('whyLabel'))}
              />
            )}
            <span className="block text-xs text-text-dim">{t(k('hiddenNote'), { corp })}</span>
            {tell && sendsTo}
          </>
        );
      case 'paid':
        if (countsHeld)
          return (
            <span className="block text-xs text-text-dim">{t(k('countsHeld'), { corp })}</span>
          );
        if (offer.noStatement || statementId === undefined)
          return (
            <span className="block text-xs text-text-dim">
              {/* A marked day the book spent the payment past: it credited it, just elsewhere. */}
              {row?.bookSpentOn
                ? t(k('noStatementSpent'), { corp, days: formatList(row.bookSpentOn) })
                : t(k('noStatement'), { corp })}
            </span>
          );
        return (
          <>
            {picking && (
              <TransferPicker
                payments={payments}
                bookCorporationId={problem.corporationId}
                corpName={corp}
                since={paidSince ?? row?.date ?? ''}
                chosen={picked}
                onChange={(next, chosen) => {
                  setPicked(next);
                  setPickedTransfers(chosen);
                }}
              />
            )}
            <TextArea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={t(k('noteLabel'))}
              placeholder={t(k('noteLabel'))}
            />
            {sendsTo}
          </>
        );
      case 'notOwed':
        return (
          <>
            <TextArea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={problem.kind === 'conflict' ? t(k('noteLabel')) : t(k('whyLabel'))}
              placeholder={problem.kind === 'conflict' ? t(k('noteLabel')) : t(k('whyLabel'))}
            />
            {sendsTo}
          </>
        );
      default:
        return null;
    }
  };

  const self = offer.outcomes.filter((o) => SELF_SERVICE.includes(o));
  const ask = offer.outcomes.filter((o) => !SELF_SERVICE.includes(o));

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      placement="medium"
      footer={
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={blocked} onClick={() => void submit()}>
            {t(k(`action.${choice}`), {
              context:
                choice === 'notPaying' && tell
                  ? 'tell'
                  : choice === 'paid' && countsHeld
                    ? 'held'
                    : undefined,
            })}
          </Button>
        </DialogFooter>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="space-y-1 rounded-xs bg-panel-2 p-2.5 text-xs">{facts}</div>
        {self.length > 0 && (
          <section className="space-y-1.5">
            <p className={eyebrowClassName}>{t(k('groupSelf'))}</p>
            {self.map(choiceView)}
          </section>
        )}
        {ask.length > 0 && (
          <section className="space-y-1.5">
            <p className={eyebrowClassName}>{t(k('groupAsk'), { corp })}</p>
            {ask.map(choiceView)}
          </section>
        )}
        {error && <InlineError>{t(k('failed'))}</InlineError>}
      </div>
    </Modal>
  );
}

/** i18next context for an outcome's wording on a given problem. */
function outcomeContext(kind: ResolveProblem['kind'], id: OutcomeId): string | undefined {
  if (id === 'pay' && kind === 'uncredited') return 'again';
  if (id === 'pay' && kind === 'overdue') return 'plain';
  if (id === 'notOwed' && kind === 'conflict') return 'payee';
  if (id === 'notOwed' && kind === 'kept') return 'kept';
  return undefined;
}

function DoneView({ done, corp }: { done: Done; corp: string }) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  if (done.kind === 'hidden') return <p className="text-sm">{t(k('result.hidden'), { corp })}</p>;
  return (
    <div className="space-y-3 text-sm">
      {done.confirmed ? (
        <p>{t(k(done.held ? 'result.countedHeld' : 'result.credited'), { corp })}</p>
      ) : (
        <p>
          {done.checks && done.checks.length > 0
            ? t(k('result.sentProof'), { corp })
            : done.again
              ? t(k('result.sentAgain'), { corp })
              : t(k('result.sent'), { corp, date: isoDay(done.holdsUntil) })}
        </p>
      )}
      {done.checks && done.checks.length > 0 && (
        <ul className="space-y-1">
          {done.checks.map((c, i) => {
            const transfer = done.transfers?.[i];
            return (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                {transfer && (
                  <span className="tabular-nums">
                    <span className="font-semibold">
                      <IskText value={transfer.amount} />
                    </span>{' '}
                    · {dateTimeAt(transfer.at, zone)}
                  </span>
                )}
                <Pill tone={CHECK_TONE[c.result]}>
                  {t(k(`check.${c.result}`), { division: c.division ?? '' })}
                </Pill>
              </li>
            );
          })}
        </ul>
      )}
      {done.mailed && (
        <p className="text-xs text-text-dim">
          {t(k(`mailed.${done.mailed.status}`), {
            count: done.mailed.status === 'sent' ? done.mailed.to.length : 0,
          })}
        </p>
      )}
    </div>
  );
}
