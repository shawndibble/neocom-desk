import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Modal, Radio, TextArea } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { InlineError } from '@/components/ui/InlineError';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { DISPUTE_HOLD_DAYS } from '@/engine/corpTaxBook/disputes';
import type { ClaimCheck, ClaimCheckResult, ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import { DAY_MS } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { eveTimeLabel } from '@/engine/corpTaxBook/removalMail';
import type { TaxQuestionMailOutcome } from '../sendTaxQuestionMail';
import { outcomesFor, SELF_SERVICE, type OutcomeId, type ResolveProblem } from './outcomes';
import { sendProof, tellNotOwed, tellNotPaying, type MailContext } from './resolveSubmit';

const k = (key: string) => `miningTax.resolve.${key}`;

/** What checking a transfer against the book found, as a pill. */
const CHECK_TONE: Record<ClaimCheckResult, PillTone> = {
  found: 'success',
  division: 'warning',
  notSynced: 'neutral',
  tooOld: 'neutral',
  notFound: 'danger',
  person: 'accent',
  otherCorp: 'warning',
};

interface Props {
  problem: ResolveProblem;
  /** Who is asking, and who answers tax questions for the book. */
  mail: MailContext;
  /** The member's own journal transfers that make the "I already paid" proof. */
  transfers?: ClaimedTransfer[];
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
      confirmed?: boolean;
      holdsUntil?: string;
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
  transfers = [],
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const corp = problem.corpName;
  const row = problem.row;
  const statementId =
    problem.kind === 'uncredited' || problem.kind === 'kept' ? problem.statementId : undefined;

  const needsText =
    choice === 'notOwed' ? problem.kind !== 'conflict' : choice === 'notPaying' && tell;
  const blocked =
    busy ||
    (needsText && text.trim() === '') ||
    (choice === 'paid' && (offer.noStatement || statementId === undefined)) ||
    (choice === 'fixRecords' && !onFixRecords);

  const holdsUntil = () => new Date(Date.now() + DISPUTE_HOLD_DAYS * DAY_MS).toISOString();

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
        setDone({ kind: 'sent', mailed, holdsUntil: holdsUntil() });
      } else if (choice === 'paid' && statementId) {
        const days = row?.date ?? '';
        const out = await sendProof(mail, statementId, transfers, text.trim(), days);
        onSent();
        setDone({ kind: 'sent', ...out });
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const title =
    problem.kind === 'uncredited'
      ? t(k('title.uncredited'))
      : problem.kind === 'conflict'
        ? t(k('title.conflict'), { date: row?.date ?? '' })
        : problem.kind === 'kept'
          ? t(k('title.kept'), { corp })
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
        <DoneView done={done} corp={corp} transfers={transfers} />
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
        className={cx(
          'rounded-xs border p-2.5',
          checked ? 'border-accent bg-accent/5' : 'border-line'
        )}
      >
        <label className="flex cursor-pointer items-start gap-2">
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
              <label className="flex cursor-pointer items-center gap-2 text-sm">
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
        if (offer.noStatement || statementId === undefined)
          return (
            <span className="block text-xs text-text-dim">{t(k('noStatement'), { corp })}</span>
          );
        return (
          <>
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
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={blocked} onClick={() => void submit()}>
            {t(k(`action.${choice}`), {
              context: choice === 'notPaying' && tell ? 'tell' : undefined,
            })}
          </Button>
        </div>
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
  if (id === 'notOwed' && kind === 'conflict') return 'payee';
  return undefined;
}

function DoneView({
  done,
  corp,
  transfers,
}: {
  done: Done;
  corp: string;
  transfers: readonly ClaimedTransfer[];
}) {
  const { t } = useTranslation();
  if (done.kind === 'hidden') return <p className="text-sm">{t(k('result.hidden'), { corp })}</p>;
  return (
    <div className="space-y-3 text-sm">
      {done.confirmed ? (
        <p>{t(k('result.credited'), { corp })}</p>
      ) : (
        <p>
          {done.checks && done.checks.length > 0
            ? t(k('result.sentProof'), { corp })
            : t(k('result.sent'), { corp, date: (done.holdsUntil ?? '').slice(0, 10) })}
        </p>
      )}
      {done.checks && done.checks.length > 0 && (
        <ul className="space-y-1">
          {done.checks.map((c, i) => {
            const transfer = transfers[i];
            return (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                {transfer && (
                  <span className="tabular-nums">
                    <span className="font-semibold">{formatIsk(transfer.amount, 0)} ISK</span> ·{' '}
                    {eveTimeLabel(Date.parse(transfer.at))}
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
