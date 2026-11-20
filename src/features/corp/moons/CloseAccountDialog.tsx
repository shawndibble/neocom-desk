/**
 * Close a guest's account (epic #4055, #4184): a final Statement over
 * everything Billable, then Statement mail stops. Credit is refunded unless the
 * guest consented to forfeit it or went 90 days without replying. Its own file
 * so the Miner page carries only the button and this mount.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl, TextArea, TextInput } from '@/components/ui';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import {
  FORFEIT_NO_REPLY_DAYS,
  forfeitAllowed,
  planCloseAccount,
  type CreditDisposition,
} from '@/engine/corpTaxBook/closeAccount';
import { DialogShell, Effect, Label } from './BookDialogs';
import { dateWithYear, isk } from './moonsFormat';
import { useBook } from './useBook';
import { statementRefineryNames, useCorporationName } from './statementMailing';

type Basis = 'consent' | 'no-reply';
/** What happens to what is still owed: a final late notice goes out, or the tax is waived. */
type Settle = 'notice' | 'dismiss';

export function CloseAccountDialog({
  open,
  onClose,
  miner,
  minerName,
  onClosed,
}: {
  open: boolean;
  onClose: () => void;
  miner: MinerRow;
  minerName: string;
  onClosed?: () => void;
}) {
  const { t } = useTranslation();
  const { view, names, edit } = useBook();
  const corporationName = useCorporationName();
  const plan = useMemo(() => planCloseAccount(view, miner.id), [view, miner.id]);
  const [reason, setReason] = useState('');
  const [settle, setSettle] = useState<Settle>('notice');
  const [forfeit, setForfeit] = useState(false);
  const [basis, setBasis] = useState<Basis>('consent');
  const [note, setNote] = useState('');
  const [askedAt, setAskedAt] = useState('');

  const today = view.input.now.slice(0, 10);
  const waivable = miner.owed + miner.unbilled;
  const dismissing = settle === 'dismiss' && waivable > 0;
  const credit = dismissing ? miner.credit : (plan?.creditAfter ?? miner.credit);
  const disposition: CreditDisposition = !forfeit
    ? { kind: 'refund' }
    : {
        kind: 'forfeit',
        basis: basis === 'consent' ? { kind: 'consent', note } : { kind: 'no-reply', askedAt },
      };
  const forfeitOk = disposition.kind === 'refund' || forfeitAllowed(disposition.basis, today);

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.dialogs.close.title', { name: minerName })}
      confirmLabel={t('corpTaxBook.moons.dialogs.close.confirm')}
      canConfirm={
        reason.trim().length > 0 &&
        forfeitOk &&
        (dismissing || !plan?.statement || corporationName !== null)
      }
      run={async () => {
        if (!dismissing && plan?.statement && corporationName === null) return;
        const statement =
          !dismissing && plan?.statement
            ? {
                ...plan.statement,
                corporationName,
                minerName,
                refineryNames: statementRefineryNames(plan.statement, names),
                // A running account issues only late notices (#6294); its final bill is one.
                ...(view.input.runningAccountFrom ? { kind: 'notice' as const } : {}),
              }
            : undefined;
        // Waive first, so the close finds nothing to bill; a failed close can be retried.
        if (dismissing) {
          await edit({
            action: 'dismiss',
            scope: 'miner',
            targetId: miner.id,
            reason: reason.trim(),
            amountIsk: waivable,
          });
        }
        await edit({
          action: 'closeAccount',
          minerId: miner.id,
          reason: reason.trim(),
          credit: disposition,
          ...(statement ? { statement } : {}),
          // A running account's credit only this client can price (#6294).
          ...(view.input.runningAccountFrom && plan
            ? { runningCredit: Math.round(plan.creditAfter) }
            : {}),
        });
        onClosed?.();
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.dialogs.close.intro')}</p>
      {waivable > 0 && (
        <Label text={t('corpTaxBook.moons.dialogs.close.settleLabel')}>
          <SegmentedControl
            label={t('corpTaxBook.moons.dialogs.close.settleLabel')}
            value={settle}
            onChange={(v) => setSettle(v as Settle)}
            options={[
              { value: 'notice', label: t('corpTaxBook.moons.dialogs.close.settleNotice') },
              { value: 'dismiss', label: t('corpTaxBook.moons.dialogs.close.settleDismiss') },
            ]}
            uppercase={false}
          />
        </Label>
      )}
      <Effect>
        {dismissing
          ? t('corpTaxBook.moons.dialogs.close.dismissing', { amount: isk(waivable) })
          : plan?.statement
            ? t('corpTaxBook.moons.dialogs.close.finalStatement', {
                amount: isk(plan.statement.amount),
                through: dateWithYear(plan.statement.coversThrough),
              })
            : t('corpTaxBook.moons.dialogs.close.noStatement')}
        {!dismissing && (
          <>
            {' '}
            {t('corpTaxBook.moons.dialogs.close.owedAfter', {
              amount: isk(plan?.owedAfter ?? miner.owed),
            })}
          </>
        )}
        {!dismissing && (plan?.pendingTax ?? 0) > 0 && (
          <>
            {' '}
            {t('corpTaxBook.moons.dialogs.close.pending', { amount: isk(plan?.pendingTax ?? 0) })}
          </>
        )}
      </Effect>

      {credit > 0 && (
        <>
          <Label text={t('corpTaxBook.moons.dialogs.close.creditLabel', { amount: isk(credit) })}>
            <SegmentedControl
              label={t('corpTaxBook.moons.dialogs.close.creditLabel', { amount: isk(credit) })}
              value={forfeit ? 'forfeit' : 'refund'}
              onChange={(v) => setForfeit(v === 'forfeit')}
              options={[
                { value: 'refund', label: t('corpTaxBook.moons.dialogs.close.refund') },
                { value: 'forfeit', label: t('corpTaxBook.moons.dialogs.close.forfeit') },
              ]}
              uppercase={false}
            />
          </Label>
          {forfeit ? (
            <>
              <SegmentedControl
                label={t('corpTaxBook.moons.dialogs.close.basis')}
                value={basis}
                onChange={(v) => setBasis(v as Basis)}
                options={[
                  { value: 'consent', label: t('corpTaxBook.moons.dialogs.close.consent') },
                  {
                    value: 'no-reply',
                    label: t('corpTaxBook.moons.dialogs.close.noReply', {
                      days: FORFEIT_NO_REPLY_DAYS,
                    }),
                  },
                ]}
                uppercase={false}
              />
              {basis === 'consent' ? (
                <Label text={t('corpTaxBook.moons.dialogs.close.consentNote')}>
                  <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </Label>
              ) : (
                <Label
                  text={t('corpTaxBook.moons.dialogs.close.askedAt', {
                    days: FORFEIT_NO_REPLY_DAYS,
                  })}
                >
                  <TextInput
                    type="date"
                    max={today}
                    value={askedAt}
                    onChange={(e) => setAskedAt(e.target.value)}
                  />
                </Label>
              )}
              {!forfeitOk && (
                <p role="status" className="text-xs text-warning">
                  {t('corpTaxBook.moons.dialogs.close.notYet', { days: FORFEIT_NO_REPLY_DAYS })}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-text-dim">
              {t('corpTaxBook.moons.dialogs.close.refundHint')}
            </p>
          )}
        </>
      )}

      <Label text={t('corpTaxBook.moons.dialogs.close.reason')}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
      {!dismissing && (
        <p className="text-xs text-text-dim">{t('corpTaxBook.moons.dialogs.close.sendHint')}</p>
      )}
    </DialogShell>
  );
}
