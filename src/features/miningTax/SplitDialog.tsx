import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { planSplit } from '@/engine/miningTax/split';
import { typeIconUrl } from '@/lib/eveImages';
import { formatIsk } from '@/lib/isk';
import { cx } from '@/lib/cx';
import { unmaskNumber } from '@/lib/numberMask';
import { splitAssignment } from './assignments';
import type { MoonMiningTaxRow } from './snapshot';

interface SplitDialogProps {
  open: boolean;
  onClose: () => void;
  /** The Assignment being split — Outstanding or Paid, never part of a joined group. */
  assignment: MiningTaxAssignmentRecord;
  /** Its Mining Ledger Entry row: the sibling Assignments decide whether the collector choice is on offer. */
  row: MoonMiningTaxRow;
  systemName: string;
  payees: readonly PayeeRecord[];
  typeNames: ReadonlyMap<number, string>;
  unitPrices: ReadonlyMap<number, number>;
  busy: boolean;
  onSplit: () => void;
}

/**
 * Splits one assigned EVE day between two Payees by quantity (issue #523):
 * one UTC day can hold two local-time sessions at two different corps' moons
 * in the same system, and ESI reports them as one entry. Per ore type a
 * slider (or typed figure) moves units to a second Payee, and a radio picks
 * which side collects any ore ESI reports for this day later
 * (`engine/miningTax/ownership.ts`). Both sides are re-priced at the current
 * Jita buy — see `splitAssignment`.
 */
export function SplitDialog({
  open,
  onClose,
  assignment,
  row,
  systemName,
  payees,
  typeNames,
  unitPrices,
  busy,
  onSplit,
}: SplitDialogProps) {
  const { t } = useTranslation();
  const otherPayees = payees.filter((p) => p.id !== assignment.payeeId);
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [taxPct, setTaxPct] = useState('');
  const [moves, setMoves] = useState<ReadonlyMap<number, number>>(new Map());
  const [collector, setCollector] = useState<'original' | 'new'>('original');
  const [saving, setSaving] = useState(false);

  // A third Assignment on this entry already collecting leaves nothing to
  // choose here — the split never silently steals that role from it.
  const someoneElseCollects = row.assignments.some(
    (a) => a.id !== assignment.id && a.collectsGrowth === true
  );

  const original = assignment.oreLines;
  // `setMove` clamps every quantity to what the line holds, so this never
  // throws — and it is the same plan `splitAssignment` commits.
  const { kept: keptLines, moved: movedLines } = planSplit(
    original,
    [...moves].map(([typeId, quantity]) => ({ typeId, quantity }))
  );
  const pctValue = Number(taxPct);
  const keptValue = computeAssignmentValue(keptLines, unitPrices, assignment.taxPct);
  const newValue = computeAssignmentValue(
    movedLines,
    unitPrices,
    Number.isFinite(pctValue) ? pctValue : 0
  );
  const movedUnits = movedLines.reduce((sum, line) => sum + line.quantity, 0);

  const canSplit =
    payeeId !== null &&
    movedLines.length > 0 &&
    keptLines.length > 0 &&
    Number.isFinite(pctValue) &&
    pctValue >= 0 &&
    pctValue <= 100;

  function setMove(typeId: number, raw: number, max: number) {
    const clamped = Math.max(0, Math.min(max, Math.round(raw)));
    setMoves((previous) => {
      const next = new Map(previous);
      if (clamped === 0) next.delete(typeId);
      else next.set(typeId, clamped);
      return next;
    });
  }

  async function handleSplit() {
    if (!canSplit || !payeeId) return;
    setSaving(true);
    try {
      await splitAssignment(
        assignment,
        {
          moves: movedLines,
          payeeId,
          taxPct: pctValue,
          ...(someoneElseCollects ? {} : { collector }),
        },
        unitPrices
      );
      onSplit();
    } finally {
      setSaving(false);
    }
  }

  const originalPayeeName =
    payees.find((p) => p.id === assignment.payeeId)?.name ?? t('miningTax.unknownPayee');
  const newPayeeName = otherPayees.find((p) => p.id === payeeId)?.name ?? '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('miningTax.splitTitle', { date: row.entry.date, system: systemName })}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">{t('miningTax.splitHint')}</p>

        {otherPayees.length === 0 ? (
          <p className="text-xs text-text-dim">{t('miningTax.splitNoOtherPayeeHint')}</p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 space-y-1 sm:flex-1">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.splitMoveToLabel')}
              </p>
              <Select
                value={payeeId ?? undefined}
                onValueChange={(value) => {
                  setPayeeId(value);
                  const chosen = otherPayees.find((p) => p.id === value);
                  if (chosen) setTaxPct(String(chosen.defaultTaxPct));
                }}
              >
                <SelectTrigger aria-label={t('miningTax.splitMoveToLabel')}>
                  <SelectValue placeholder={t('miningTax.payeePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {otherPayees.map((payee) => (
                    <SelectItem key={payee.id} value={payee.id}>
                      {payee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:w-16 sm:shrink-0">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.taxPctLabel')}
              </p>
              <TextInput
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
                aria-label={t('miningTax.taxPctLabel')}
                className="w-full"
              />
            </div>
          </div>
        )}

        <div className="rounded-xs border border-line bg-panel-2">
          <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            <span>{t('miningTax.oreColumn')}</span>
            <span className="text-accent">{t('miningTax.splitMovesColumn')}</span>
          </div>
          <ul className="divide-y divide-line">
            {original.map((line) => {
              const moved = moves.get(line.typeId) ?? 0;
              const inputId = `split-${line.typeId}`;
              return (
                <li key={line.typeId} className="space-y-1.5 px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <img src={typeIconUrl(line.typeId, 32)} alt="" className="h-4 w-4 shrink-0" />
                    <label htmlFor={inputId} className="min-w-0 flex-1 truncate">
                      {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                      <span className="ml-1.5 text-xs text-text-dim tabular-nums">
                        {line.quantity.toLocaleString()}
                      </span>
                    </label>
                    <TextInput
                      id={inputId}
                      size="sm"
                      type="text"
                      inputMode="numeric"
                      value={moved === 0 ? '' : moved.toLocaleString()}
                      placeholder="0"
                      onChange={(e) =>
                        setMove(line.typeId, unmaskNumber(e.target.value) ?? 0, line.quantity)
                      }
                      className={cx('w-28 text-right', moved > 0 && 'border-accent')}
                    />
                  </div>
                  <input
                    type="range"
                    aria-label={t('miningTax.splitSliderLabel', {
                      ore: typeNames.get(line.typeId) ?? `#${line.typeId}`,
                    })}
                    min={0}
                    max={line.quantity}
                    value={moved}
                    onChange={(e) => setMove(line.typeId, Number(e.target.value), line.quantity)}
                    className="h-2 w-full cursor-pointer accent-accent"
                  />
                </li>
              );
            })}
          </ul>
        </div>

        {!someoneElseCollects && (
          <fieldset className="space-y-1">
            <legend className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('miningTax.splitCollectorLabel')}
            </legend>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name="split-collector"
                checked={collector === 'original'}
                onChange={() => setCollector('original')}
              />
              {t('miningTax.splitCollectorKeeps', { payee: originalPayeeName })}
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name="split-collector"
                checked={collector === 'new'}
                onChange={() => setCollector('new')}
              />
              {t('miningTax.splitCollectorNew', {
                payee: newPayeeName || t('miningTax.splitNewSideLabel'),
              })}
            </label>
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5 rounded-xs border border-line p-2">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('miningTax.splitKeepsLabel', { payee: originalPayeeName })}
            </p>
            <p className="tabular-nums">
              {formatIsk(keptValue.estimatedValue, 2)} ISK ·{' '}
              <span className="text-isk-neg">{formatIsk(keptValue.taxOwed, 2)} ISK</span>{' '}
              {t('miningTax.splitAtPct', { pct: assignment.taxPct })}
            </p>
          </div>
          <div
            className={cx(
              'space-y-0.5 rounded-xs border p-2',
              movedLines.length > 0 ? 'border-accent' : 'border-line'
            )}
          >
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('miningTax.splitNewLabel', {
                payee: newPayeeName || t('miningTax.splitNewSideLabel'),
              })}
            </p>
            <p className="tabular-nums">
              {formatIsk(newValue.estimatedValue, 2)} ISK ·{' '}
              <span className="text-isk-neg">{formatIsk(newValue.taxOwed, 2)} ISK</span>{' '}
              {t('miningTax.splitAtPct', { pct: Number.isFinite(pctValue) ? pctValue : 0 })}
            </p>
          </div>
        </div>
        <p className="text-[0.6875rem] text-text-dim">{t('miningTax.splitRepriceHint')}</p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            disabled={!canSplit || saving || busy}
            onClick={() => void handleSplit()}
          >
            {t('miningTax.splitConfirmAction', { count: movedUnits })}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
