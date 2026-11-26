import { parsePercent } from '@/lib/parsePercent';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IskInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
  TextArea,
  TextInput,
} from '@/components/ui';
import type { DayRow, MinerRow } from '@/engine/corpTaxBook/bookView';
import { accountBalance, balanceAdjustment } from '@/engine/corpTaxBook/balanceAdjustment';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import { DialogShell, Effect, Label } from './BookDialogs';
import { canOverrideDay } from './dayEligibility';
import { dateWithYear, isk, shortDate } from './moonsFormat';
import { useBook } from './useBook';
import { lockDateFor } from '../../../../functions/src/corpTaxBookCheckpoint';

function DateReadback({ date }: { date: string }) {
  return <span className="block text-xs text-text-dim">{dateWithYear(date)}</span>;
}

export function RateOverrideDialog({
  open,
  onClose,
  days,
  initialKey = '',
}: {
  open: boolean;
  onClose: () => void;
  days: readonly DayRow[];
  initialKey?: string;
}) {
  const { t } = useTranslation();
  const { edit, names, view } = useBook();
  const eligible = days.filter((d) => canOverrideDay(d, view.input.now));
  const [key, setKey] = useState(initialKey);
  const [pct, setPct] = useState('');
  const [reason, setReason] = useState('');
  const day = eligible.find((d) => d.key === key);
  const value = parsePercent(pct) ?? NaN;
  const valid = value >= 0 && value <= 100;
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.corrections.rate.title')}
      confirmLabel={t('corpTaxBook.moons.corrections.rate.confirm')}
      canConfirm={day !== undefined && valid && reason.trim().length > 0}
      run={async () => {
        await edit({ action: 'setRecordRate', recordKey: key, pct: value, reason: reason.trim() });
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.corrections.rate.intro')}</p>
      <Label text={t('corpTaxBook.moons.corrections.rate.day')}>
        <Select value={key} onValueChange={setKey}>
          <SelectTrigger
            aria-label={t('corpTaxBook.moons.corrections.rate.day')}
            className="w-full"
          >
            <SelectValue placeholder={t('corpTaxBook.moons.corrections.rate.pickDay')} />
          </SelectTrigger>
          <SelectContent>
            {eligible.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {`${shortDate(d.date)} · ${names.character(d.characterId)} · ${names.refinery(d.structureId)} · ${d.taxPct}%`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <Label text={t('corpTaxBook.moons.corrections.rate.pct')}>
        <TextInput inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
      </Label>
      <Label text={t('corpTaxBook.moons.corrections.reason')}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
      {day && valid && (
        <Effect>
          {t('corpTaxBook.moons.corrections.rate.effect', {
            from: `${day.taxPct}%`,
            to: `${value}%`,
            tax: isk((day.estimatedValue * value) / 100),
          })}
        </Effect>
      )}
    </DialogShell>
  );
}

export function AdjustmentDialog({
  open,
  onClose,
  miner,
  minerName,
  defaultDate,
  openingDate,
}: {
  open: boolean;
  onClose: () => void;
  miner: MinerRow;
  minerName: string;
  defaultDate: string;
  openingDate?: string;
}) {
  const { t } = useTranslation();
  const { edit, view } = useBook();
  const lockDate = lockDateFor(view.input.now.slice(0, 10));
  const balanceText = (balance: number) =>
    balance > 0
      ? t('corpTaxBook.moons.corrections.adjust.owesAmount', { amount: isk(balance) })
      : balance < 0
        ? t('corpTaxBook.moons.corrections.adjust.creditAmount', { amount: isk(-balance) })
        : t('corpTaxBook.moons.corrections.adjust.squareBalance');
  const [kind, setKind] = useState<'charge' | 'credit' | 'set'>('credit');
  const [side, setSide] = useState<'owes' | 'credit'>('owes');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [reason, setReason] = useState('');
  const entered = Number(amount);
  const current = accountBalance(miner);
  const delta =
    kind === 'set' ? balanceAdjustment(current, side === 'owes' ? entered : -entered) : 0;
  const value = kind === 'set' ? Math.abs(delta) : entered;
  const signed = kind === 'set' ? delta : kind === 'credit' ? -entered : entered;
  const ready = kind === 'set' ? amount.trim() !== '' && entered >= 0 && delta !== 0 : value > 0;
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.corrections.adjust.title', { name: minerName })}
      confirmLabel={
        value > 0
          ? t('corpTaxBook.moons.corrections.adjust.confirm', { amount: isk(value) })
          : t('corpTaxBook.moons.corrections.adjust.confirmEmpty')
      }
      canConfirm={ready && date >= lockDate && reason.trim().length > 0}
      run={async () => {
        await edit({
          action: 'addAdjustment',
          minerId: miner.id,
          date,
          amount: signed,
          reason: reason.trim(),
          ...(kind === 'set' ? { kind: 'opening' } : {}),
        });
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.corrections.adjust.intro')}</p>
      <Label text={t('corpTaxBook.moons.corrections.adjust.kind')}>
        <SegmentedControl
          label={t('corpTaxBook.moons.corrections.adjust.kind')}
          value={kind}
          onChange={(next) => {
            setKind(next);
            if (next === 'set') {
              if (openingDate && date === defaultDate) setDate(openingDate);
              if (reason.trim() === '')
                setReason(t('corpTaxBook.moons.corrections.adjust.openingLabel'));
            }
          }}
          options={[
            { value: 'credit', label: t('corpTaxBook.moons.corrections.adjust.credit') },
            { value: 'charge', label: t('corpTaxBook.moons.corrections.adjust.charge') },
            { value: 'set', label: t('corpTaxBook.moons.corrections.adjust.set') },
          ]}
          uppercase={false}
        />
      </Label>
      {kind === 'set' && (
        <>
          <p className="text-text-dim">
            {t('corpTaxBook.moons.corrections.adjust.currentBalance', {
              balance: balanceText(current),
            })}
          </p>
          <Label text={t('corpTaxBook.moons.corrections.adjust.setSide')}>
            <SegmentedControl
              label={t('corpTaxBook.moons.corrections.adjust.setSide')}
              value={side}
              onChange={setSide}
              options={[
                { value: 'owes', label: t('corpTaxBook.moons.corrections.adjust.owes') },
                { value: 'credit', label: t('corpTaxBook.moons.corrections.adjust.holdsCredit') },
              ]}
              uppercase={false}
            />
          </Label>
        </>
      )}
      <Label
        text={t(
          kind === 'set'
            ? 'corpTaxBook.moons.corrections.adjust.setAmount'
            : 'corpTaxBook.moons.corrections.adjust.amount'
        )}
      >
        <IskInput
          value={amount}
          onChange={setAmount}
          aria-label={t('corpTaxBook.moons.corrections.adjust.amount')}
        />
      </Label>
      {kind === 'set' && date > defaultDate && (
        <p className="text-warning">
          {t('corpTaxBook.moons.corrections.adjust.setNotBillable', {
            date: dateWithYear(defaultDate),
          })}
        </p>
      )}
      {kind === 'set' && amount.trim() !== '' && (
        <p className="text-text-dim">
          {delta === 0
            ? t('corpTaxBook.moons.corrections.adjust.setNothing')
            : t(
                delta > 0
                  ? 'corpTaxBook.moons.corrections.adjust.setWillCharge'
                  : 'corpTaxBook.moons.corrections.adjust.setWillCredit',
                { amount: isk(Math.abs(delta)) }
              )}
        </p>
      )}
      <Label text={t('corpTaxBook.moons.corrections.adjust.date')}>
        <TextInput
          type="date"
          value={date}
          min={lockDate}
          onChange={(e) => setDate(e.target.value)}
        />
        {date !== '' && <DateReadback date={date} />}
      </Label>
      <Label text={t('corpTaxBook.moons.corrections.adjust.label')}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
    </DialogShell>
  );
}

export function EditCorrectionDialog({
  open,
  onClose,
  adjustment,
  minerName,
}: {
  open: boolean;
  onClose: () => void;
  adjustment: Adjustment;
  minerName: string;
}) {
  const { t } = useTranslation();
  const { edit, view } = useBook();
  const lockDate = lockDateFor(view.input.now.slice(0, 10));
  const [kind, setKind] = useState<'charge' | 'credit'>(
    adjustment.amount < 0 ? 'credit' : 'charge'
  );
  const [amount, setAmount] = useState(String(Math.abs(adjustment.amount)));
  const [date, setDate] = useState(adjustment.date);
  const [reason, setReason] = useState(adjustment.reason);
  const value = Number(amount);
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.ledger.dialogs.editCorrection.title', { name: minerName })}
      confirmLabel={t('corpTaxBook.moons.ledger.dialogs.editCorrection.confirm')}
      canConfirm={value > 0 && date >= lockDate && reason.trim().length > 0}
      run={async () => {
        await edit({
          action: 'editAdjustment',
          adjustmentId: adjustment.id,
          date,
          amount: kind === 'credit' ? -value : value,
          reason: reason.trim(),
        });
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.ledger.dialogs.editCorrection.intro')}</p>
      <Label text={t('corpTaxBook.moons.corrections.adjust.kind')}>
        <SegmentedControl
          label={t('corpTaxBook.moons.corrections.adjust.kind')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'credit', label: t('corpTaxBook.moons.corrections.adjust.credit') },
            { value: 'charge', label: t('corpTaxBook.moons.corrections.adjust.charge') },
          ]}
          uppercase={false}
        />
      </Label>
      <Label text={t('corpTaxBook.moons.corrections.adjust.amount')}>
        <IskInput
          value={amount}
          onChange={setAmount}
          aria-label={t('corpTaxBook.moons.corrections.adjust.amount')}
        />
      </Label>
      <Label text={t('corpTaxBook.moons.corrections.adjust.date')}>
        <TextInput
          type="date"
          value={date}
          min={lockDate}
          onChange={(e) => setDate(e.target.value)}
        />
        {date !== '' && <DateReadback date={date} />}
      </Label>
      <Label text={t('corpTaxBook.moons.corrections.adjust.label')}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
    </DialogShell>
  );
}

export function MarketAdjustmentDialog({
  open,
  onClose,
  minerId,
  date,
  forgiven,
}: {
  open: boolean;
  onClose: () => void;
  minerId: string;
  date: string;
  forgiven: number;
}) {
  const { t } = useTranslation();
  const { edit } = useBook();
  const [amount, setAmount] = useState(String(Math.round(forgiven)));
  const [reason, setReason] = useState('');
  const value = Number(amount);
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.ledger.dialogs.marketEdit.title')}
      confirmLabel={t('corpTaxBook.moons.ledger.dialogs.marketEdit.confirm')}
      canConfirm={amount.trim() !== '' && value >= 0 && reason.trim().length > 0}
      run={async () => {
        await edit({
          action: 'setToleranceExemption',
          minerId,
          date,
          forgive: value,
          reason: reason.trim(),
        });
      }}
    >
      <p className="text-text-dim">
        {t('corpTaxBook.moons.ledger.dialogs.marketEdit.intro', {
          date: dateWithYear(date),
          amount: isk(forgiven),
        })}
      </p>
      <Label text={t('corpTaxBook.moons.ledger.dialogs.marketEdit.amount')}>
        <IskInput
          value={amount}
          onChange={setAmount}
          aria-label={t('corpTaxBook.moons.ledger.dialogs.marketEdit.amount')}
        />
      </Label>
      <Label text={t('corpTaxBook.moons.ledger.dialogs.reasonLabel')}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
    </DialogShell>
  );
}
