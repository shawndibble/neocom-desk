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
import { canRebillFrom } from '@/engine/corpTaxBook/statements';
import { DialogShell, Effect, Label } from './BookDialogs';
import { dateWithYear, isk, shortDate } from './moonsFormat';
import { useBook } from './useBook';

/** The chosen date the way the rest of the book writes it: the browser's date field shows the locale's format. */
function DateReadback({ date }: { date: string }) {
  return <span className="block text-xs text-text-dim">{dateWithYear(date)}</span>;
}

/** A day's rate can be overridden only before it is on a Statement (D31). */
const canOverrideDay = (d: DayRow) => d.status === 'unbilled' || d.status === 'not-billable';

/** Per-record rate override (D31): a logged officer correction on a day not yet on a Statement. */
export function RateOverrideDialog({
  open,
  onClose,
  days,
}: {
  open: boolean;
  onClose: () => void;
  days: readonly DayRow[];
}) {
  const { t } = useTranslation();
  const { edit, names } = useBook();
  const eligible = days.filter(canOverrideDay);
  const [key, setKey] = useState('');
  const [pct, setPct] = useState('');
  const [reason, setReason] = useState('');
  const day = eligible.find((d) => d.key === key);
  const value = Number(pct);
  const valid = pct.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100;
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

/** A correction line (`addAdjustment`): billed on the next Statement as a labelled line. */
export function AdjustmentDialog({
  open,
  onClose,
  miner,
  minerName,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  miner: MinerRow;
  minerName: string;
  defaultDate: string;
}) {
  const { t } = useTranslation();
  const { edit } = useBook();
  const [kind, setKind] = useState<'charge' | 'credit'>('credit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [reason, setReason] = useState('');
  const value = Number(amount);
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
      canConfirm={value > 0 && date !== '' && reason.trim().length > 0}
      run={async () => {
        await edit({
          action: 'addAdjustment',
          minerId: miner.id,
          date,
          amount: kind === 'credit' ? -value : value,
          reason: reason.trim(),
        });
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.corrections.adjust.intro')}</p>
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
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {date !== '' && <DateReadback date={date} />}
      </Label>
      <Label text={t('corpTaxBook.moons.corrections.adjust.label')}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
      <Effect>{t('corpTaxBook.moons.corrections.adjust.effect')}</Effect>
    </DialogShell>
  );
}

/** Rebill from date (D22): never reaches a paid Statement; for a member it needs a Director. */
export function RebillDialog({
  open,
  onClose,
  miner,
  minerName,
  statements,
}: {
  open: boolean;
  onClose: () => void;
  miner: MinerRow;
  minerName: string;
  statements: Parameters<typeof canRebillFrom>[1];
}) {
  const { t } = useTranslation();
  const { edit, verdict, data } = useBook();
  const [fromDate, setFromDate] = useState('');
  const [reason, setReason] = useState('');
  const open_ = fromDate !== '' && canRebillFrom(fromDate, statements, data.state.paidStatementIds);
  const needsDirector = miner.standing !== 'guest' && !verdict.isDirector;
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.corrections.rebill.title', { name: minerName })}
      confirmLabel={t('corpTaxBook.moons.corrections.rebill.confirm')}
      canConfirm={open_ && reason.trim().length > 0}
      run={async () => {
        await edit({ action: 'rebill', minerId: miner.id, fromDate, reason: reason.trim() });
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.corrections.rebill.intro')}</p>
      <Label text={t('corpTaxBook.moons.corrections.rebill.from')}>
        <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        {fromDate !== '' && <DateReadback date={fromDate} />}
      </Label>
      {fromDate !== '' && !open_ && (
        <p role="alert" className="text-xs text-danger">
          {t('corpTaxBook.moons.corrections.rebill.paid')}
        </p>
      )}
      <Label text={t('corpTaxBook.moons.corrections.reason')}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
      <Effect>
        {t('corpTaxBook.moons.corrections.rebill.effect')}
        {needsDirector && ` ${t('corpTaxBook.moons.corrections.rebill.director')}`}
      </Effect>
    </DialogShell>
  );
}
