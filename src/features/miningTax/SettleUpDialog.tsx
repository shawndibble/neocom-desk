import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, Modal, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MiningTaxAssignmentRecord, MiningTaxPaymentMethod } from '@/db';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { loadWalletJournal } from '@/features/character/wallet';
import { humanizeRefType } from '@/features/character/format';
import { writeToClipboard } from '@/lib/clipboard';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate } from '@/lib/localDate';
import { markAssignmentsPaid } from './assignments';
import { formatDateRange } from './groupRows';
import { amountMatches, findPaymentCandidates } from './paymentMatches';

export interface SettleUpRow {
  assignment: MiningTaxAssignmentRecord;
  characterName: string;
  payeeName: string;
}

interface SettleUpDialogProps {
  open: boolean;
  onClose: () => void;
  /** Every Outstanding Assignment on offer — a balance card's whole balance, or the table's checkbox selection. */
  rows: readonly SettleUpRow[];
  systemNames: ReadonlyMap<number, string>;
  onPaid: () => void;
}

type Step = 1 | 2 | 3;
/** Which of step 2's three copyable figures just went to the clipboard. */
type CopyTarget = 'amount' | 'recipient' | 'reason';
const METHODS: readonly MiningTaxPaymentMethod[] = ['donation', 'contract', 'other'];

/**
 * Settle up (issue #523's lump-sum payment flow, replacing the one-click
 * bulk-pay confirmation): (1) the itemized entries with tick/untick and a
 * running total — the decision doc's "never a blind mark-all-paid" rule;
 * (2) the exact whole-ISK amount to send in the EVE client, copyable, with
 * the Payee name and a reason string, since the app cannot move ISK;
 * (3) record it — paid-on date, method, and an optional link to a recent
 * outgoing wallet-journal entry the app already caches. Steps 2 and 3 are
 * skippable for the quick case.
 */
export function SettleUpDialog({ open, onClose, rows, systemNames, onPaid }: SettleUpDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  // The date the pilot paid, in their own calendar — a local date, not an EVE one.
  const [paidOn, setPaidOn] = useState(() => formatLocalDate(new Date()));
  const [method, setMethod] = useState<MiningTaxPaymentMethod>('donation');
  const [contractId, setContractId] = useState('');
  const [journalRefId, setJournalRefId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<WalletJournalEntry[] | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const included = useMemo(
    () => rows.filter((r) => !excluded.has(r.assignment.id)),
    [rows, excluded]
  );
  const total = included.reduce((sum, r) => sum + r.assignment.taxOwed, 0);
  // Whole ISK: the in-game transfer field takes no fractions.
  const amountToSend = Math.round(total);
  const payeeNames = [...new Set(included.map((r) => r.payeeName))];
  const recipient =
    payeeNames.length === 1
      ? payeeNames[0]
      : t('miningTax.settleUpSeveralPayees', { count: payeeNames.length });
  const dateRange = formatDateRange(included.map((r) => r.assignment.date).sort());
  const systemName = (solarSystemId: number) =>
    systemNames.get(solarSystemId) ?? `#${String(solarSystemId)}`;
  const systems = [...new Set(included.map((r) => systemName(r.assignment.solarSystemId)))];
  const reason = t('miningTax.settleUpReasonText', {
    systems: systems.join('/'),
    range: dateRange,
  });

  // Step 3 only: the paying character(s)' cached journal, narrowed to what
  // could be this payment. Not on open — most settle-ups never get here.
  useEffect(() => {
    if (step !== 3 || candidates !== null) return;
    let cancelled = false;
    const characterIds = [...new Set(included.map((r) => r.assignment.characterId))];
    void Promise.all(characterIds.map((id) => loadWalletJournal(id))).then((results) => {
      if (cancelled) return;
      const entries = results.flatMap((result) => result?.data ?? []);
      setCandidates(findPaymentCandidates(entries, amountToSend, new Date()));
    });
    return () => {
      cancelled = true;
    };
  }, [step, candidates, included, amountToSend]);

  function toggle(id: string) {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copy(kind: CopyTarget, text: string) {
    try {
      await writeToClipboard(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

  async function commit(withPayment: boolean) {
    if (included.length === 0) return;
    setSaving(true);
    try {
      const parsedContract = Number(contractId);
      await markAssignmentsPaid(
        included.map((r) => r.assignment),
        withPayment
          ? {
              paidOn,
              method,
              amount: amountToSend,
              ...(journalRefId !== null ? { journalRefId } : {}),
              ...(method === 'contract' &&
              contractId.trim() !== '' &&
              Number.isFinite(parsedContract)
                ? { contractId: parsedContract }
                : {}),
            }
          : undefined
      );
      onPaid();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const stepLabel = (n: Step, label: string) => (
    <span
      className={cx(
        'flex items-center gap-2 text-[0.6875rem] font-semibold tracking-widest uppercase',
        n === step ? 'text-accent' : 'text-text-dim'
      )}
    >
      <span
        className={cx(
          'inline-flex size-5 items-center justify-center rounded-xs border',
          n === step ? 'border-accent' : 'border-line'
        )}
      >
        {n}
      </span>
      {label}
    </span>
  );

  const copyButton = (kind: CopyTarget, text: string) => (
    <Button
      size="sm"
      onClick={() => void copy(kind, text)}
      aria-label={t('miningTax.settleUpCopy')}
    >
      {copied === kind ? (
        <Icon.Done size={Icon.ICON_SIZE.sm} />
      ) : (
        <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
      )}
      {copied === kind ? t('miningTax.settleUpCopied') : t('miningTax.settleUpCopy')}
    </Button>
  );

  return (
    <Modal open={open} onClose={onClose} title={t('miningTax.settleUpTitle', { payee: recipient })}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {stepLabel(1, t('miningTax.settleUpStep1'))}
          {stepLabel(2, t('miningTax.settleUpStep2'))}
          {stepLabel(3, t('miningTax.settleUpStep3'))}
        </div>

        {step === 1 && (
          <>
            <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
              {rows.map((r) => {
                const on = !excluded.has(r.assignment.id);
                return (
                  <li key={r.assignment.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(r.assignment.id)}
                        aria-label={t('miningTax.settleUpIncludeLabel', {
                          date: r.assignment.date,
                        })}
                      />
                      <span className="w-20 shrink-0 tabular-nums">{r.assignment.date}</span>
                      <span className="min-w-0 flex-1 truncate text-text-dim">
                        {systemName(r.assignment.solarSystemId)} · {r.characterName}
                        {payeeNames.length > 1 && ` · ${r.payeeName}`}
                      </span>
                      <span className={cx('shrink-0 tabular-nums', !on && 'text-text-faint')}>
                        {formatIsk(r.assignment.taxOwed, 2)} ISK
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.6875rem] text-text-dim">
                {t('miningTax.settleUpIncluded', { count: included.length, range: dateRange })}
                {' · '}
                {t('miningTax.settleUpUntickHint')}
              </span>
              <span className="text-sm font-semibold tabular-nums">{formatIsk(total, 2)} ISK</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                disabled={included.length === 0}
                onClick={() => setStep(2)}
              >
                {t('miningTax.settleUpNextPay')}
              </Button>
              <Button
                size="sm"
                disabled={included.length === 0 || saving}
                onClick={() => void commit(false)}
              >
                {t('miningTax.settleUpJustMarkPaid')}
              </Button>
              <Button size="sm" onClick={onClose}>
                {t('filters.cancel')}
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-3">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.settleUpAmountLabel')}
              </p>
              <p className="text-xl font-semibold tabular-nums">{formatIsk(amountToSend, 0)}</p>
              <p className="text-[0.6875rem] text-text-dim">{t('miningTax.settleUpAmountHint')}</p>
              <div className="pt-1">{copyButton('amount', String(amountToSend))}</div>
            </div>
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.settleUpRecipientLabel')}
              </p>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-xs">
                  {recipient}
                </span>
                {payeeNames.length === 1 && copyButton('recipient', recipient)}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.settleUpReasonLabel')}
              </p>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-xs text-text-dim">
                  {reason}
                </span>
                {copyButton('reason', reason)}
              </div>
            </div>
            <p className="text-[0.6875rem] text-text-dim">{t('miningTax.settleUpPayHint')}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={() => setStep(3)}>
                {t('miningTax.settleUpNextRecord')}
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void commit(false)}>
                {t('miningTax.settleUpJustMarkPaid')}
              </Button>
              <Button size="sm" onClick={() => setStep(1)}>
                {t('miningTax.settleUpBack')}
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="space-y-1 sm:w-40 sm:shrink-0">
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('miningTax.settleUpPaidOnLabel')}
                </p>
                <TextInput
                  type="date"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                  aria-label={t('miningTax.settleUpPaidOnLabel')}
                  className="w-full"
                />
              </div>
              <div className="min-w-0 space-y-1 sm:flex-1">
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('miningTax.settleUpMethodLabel')}
                </p>
                <div className="flex gap-1.5">
                  {METHODS.map((m) => (
                    <FilterChip
                      key={m}
                      label={t(`miningTax.settleUpMethod.${m}`)}
                      selected={method === m}
                      onToggle={() => setMethod(m)}
                      className="flex-1 justify-center"
                    />
                  ))}
                </div>
              </div>
            </div>
            {method === 'contract' && (
              <div className="space-y-1">
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('miningTax.settleUpContractIdLabel')}
                </p>
                <TextInput
                  type="text"
                  inputMode="numeric"
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  placeholder={t('miningTax.settleUpContractIdPlaceholder')}
                  aria-label={t('miningTax.settleUpContractIdLabel')}
                  className="w-full"
                />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.settleUpJournalLabel')}
              </p>
              {candidates === null ? (
                <p className="text-xs text-text-dim">{t('common.loading')}</p>
              ) : candidates.length === 0 ? (
                <p className="text-xs text-text-dim">{t('miningTax.settleUpJournalEmpty')}</p>
              ) : (
                <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
                  <li>
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
                      <input
                        type="radio"
                        name="journal-link"
                        checked={journalRefId === null}
                        onChange={() => setJournalRefId(null)}
                      />
                      <span className="text-text-dim">{t('miningTax.settleUpJournalNone')}</span>
                    </label>
                  </li>
                  {candidates.map((entry) => {
                    const match = amountMatches(entry, amountToSend);
                    return (
                      <li key={entry.id}>
                        <label
                          className={cx(
                            'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs',
                            match && 'border-l border-accent'
                          )}
                        >
                          <input
                            type="radio"
                            name="journal-link"
                            checked={journalRefId === entry.id}
                            onChange={() => setJournalRefId(entry.id)}
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="tabular-nums">
                              {formatIsk(entry.amount ?? 0, 2)} ISK · {entry.date.slice(0, 10)}
                            </span>
                            <span className="truncate text-text-dim">
                              {humanizeRefType(entry.ref_type)}
                              {entry.reason ? ` · ${entry.reason}` : ''}
                            </span>
                          </span>
                          {match && (
                            <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-success uppercase">
                              {t('miningTax.settleUpJournalMatch')}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-[0.6875rem] text-text-dim">{t('miningTax.settleUpJournalHint')}</p>
            </div>
            <p className="text-xs">
              {t('miningTax.settleUpSummary', {
                count: included.length,
                amount: `${formatIsk(total, 2)} ISK`,
              })}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                disabled={saving || included.length === 0 || paidOn === ''}
                onClick={() => void commit(true)}
              >
                {t('miningTax.settleUpRecordAction')}
              </Button>
              <Button size="sm" onClick={() => setStep(2)}>
                {t('miningTax.settleUpBack')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
