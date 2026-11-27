import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState } from 'react';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { OreIcon, OreLink } from './OreIcon';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FilterChip,
  InfoTooltip,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  Radio,
  Slider,
  Tooltip,
} from '@/components/ui';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { OreLine } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { growthMoves, maxUnreportedClaim, planSplit } from '@/engine/miningTax/split';
import { formatIsk } from '@/lib/isk';
import { cx } from '@/lib/cx';
import { split, type SplitCollector } from './ledgerActions';
import { ratesForPayee } from './payeeRates';
import { labelSuggestions } from './assignmentLabel';
import { LabelField } from './LabelField';
import type { MoonMiningTaxRow } from './snapshot';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';
import { formatCount } from '@/lib/formatCount';
import { clamp, sum } from '@/engine/math';

const typedUnits = (value: string) => Number(value.replace(/\D/g, ''));

interface SplitDialogProps {
  open: boolean;
  onClose: () => void;
  assignment: MiningTaxAssignmentRecord;
  row: MoonMiningTaxRow;
  systemName: string;
  payees: readonly PayeeRecord[];
  assignments?: readonly MiningTaxAssignmentRecord[];
  typeNames: ReadonlyMap<number, string>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  busy: boolean;
  onSplit: () => void;
}

export function SplitDialog({
  open,
  onClose,
  assignment,
  row,
  systemName,
  payees,
  assignments = [],
  typeNames,
  pricesFor,
  busy,
  onSplit,
}: SplitDialogProps) {
  const { t } = useTranslation();
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [taxPct, setTaxPct] = useState('');
  const [label, setLabel] = useState('');
  const original = assignment.oreLines;
  const [keeps, setKeeps] = useState<ReadonlyMap<number, number>>(() => {
    const growth =
      assignment.status === 'needs-review' && assignment.reviewDiff
        ? growthMoves(assignment.reviewDiff, original)
        : [];
    return new Map(
      original.map((line) => [
        line.typeId,
        line.quantity - (growth.find((g) => g.typeId === line.typeId)?.quantity ?? 0),
      ])
    );
  });
  const currentCollector = row.assignments.find(
    (a) => a.id !== assignment.id && a.collectsGrowth === true
  );
  const [collector, setCollector] = useState<SplitCollector | 'current'>(
    currentCollector ? 'current' : 'new'
  );
  const { pending: saving, error: saveError, run } = useLedgerAction();

  const canClaimUnreported = assignment.status !== 'paid';

  const moves: OreLine[] = [];
  const unreported: OreLine[] = [];
  for (const line of original) {
    const keep = keeps.get(line.typeId) ?? line.quantity;
    if (keep < line.quantity) moves.push({ typeId: line.typeId, quantity: line.quantity - keep });
    if (keep > line.quantity)
      unreported.push({
        typeId: line.typeId,
        quantity: Math.min(keep - line.quantity, maxUnreportedClaim(line.quantity)),
      });
  }
  const { kept: keptLines, moved: movedLines } = planSplit(original, moves, unreported);
  const claimsUnreported = unreported.length > 0;
  const effectiveCollector = claimsUnreported ? 'new' : collector;
  const pctValue = Number(taxPct);
  const safePct = Number.isFinite(pctValue) ? pctValue : 0;
  const prices = {
    kept: pricesFor(payees.find((p) => p.id === assignment.payeeId)?.hubId, assignment.date),
    moved: pricesFor(payees.find((p) => p.id === payeeId)?.hubId, assignment.date),
  };
  const keptValue = computeAssignmentValue(keptLines, prices.kept, assignment.taxPct);
  const newValue = computeAssignmentValue(movedLines, prices.moved, safePct);
  const movedUnits = sum(movedLines.map((line) => line.quantity));
  const unreportedUnits = sum(unreported.map((line) => line.quantity));

  const refuses = payeeId === assignment.payeeId && pctValue === assignment.taxPct;
  const chosenPayee = payees.find((p) => p.id === payeeId);
  const rateChips = chosenPayee
    ? ratesForPayee(assignments, chosenPayee.id, chosenPayee.defaultTaxPct)
    : [];

  const canSplit =
    payeeId !== null &&
    !refuses &&
    (movedLines.length > 0 || claimsUnreported) &&
    keptLines.length > 0 &&
    Number.isFinite(pctValue) &&
    pctValue >= 0 &&
    pctValue <= 100;

  function setKeep(typeId: number, raw: number, held: number) {
    const ceiling = canClaimUnreported ? held + maxUnreportedClaim(held) : held;
    const clamped = clamp(Math.round(raw), 0, ceiling);
    setKeeps((previous) => new Map(previous).set(typeId, clamped));
  }

  async function handleSplit() {
    if (!canSplit || !payeeId) return;
    await run(
      () =>
        split(
          assignment,
          {
            moves: movedLines,
            unreported,
            payeeId,
            taxPct: pctValue,
            label,
            ...(effectiveCollector === 'current' ? {} : { collector: effectiveCollector }),
          },
          prices
        ),
      onSplit
    );
  }

  const originalPayeeName =
    payees.find((p) => p.id === assignment.payeeId)?.name ?? t('miningTax.unknownPayee');
  const newPayeeName = chosenPayee?.name ?? '';
  const currentCollectorName = currentCollector
    ? (payees.find((p) => p.id === currentCollector.payeeId)?.name ?? t('miningTax.unknownPayee'))
    : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissOnOutsidePress={false}
      title={t('miningTax.splitTitle', { date: row.entry.date, system: systemName })}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">{t('miningTax.splitDialogHint')}</p>

        {payees.length === 0 ? (
          <p className="text-xs text-text-dim">{t('miningTax.splitNoOtherPayeeHint')}</p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 space-y-1 sm:flex-1">
              <p className={eyebrowClassName}>{t('miningTax.splitMoveToLabel')}</p>
              <Select
                value={payeeId ?? undefined}
                onValueChange={(value) => {
                  setPayeeId(value);
                  const chosen = payees.find((p) => p.id === value);
                  if (chosen) setTaxPct(String(chosen.defaultTaxPct));
                }}
              >
                <SelectTrigger aria-label={t('miningTax.splitMoveToLabel')}>
                  <SelectValue placeholder={t('miningTax.payeePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {payees.map((payee) => (
                    <SelectItem key={payee.id} value={payee.id}>
                      {payee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:w-16 sm:shrink-0">
              <p className={eyebrowClassName}>{t('miningTax.taxPctLabel')}</p>
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

        <LabelField
          value={label}
          onChange={setLabel}
          suggestions={
            payeeId ? labelSuggestions(assignments, payeeId, assignment.solarSystemId) : []
          }
        />

        {rateChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={eyebrowClassName}>{t('miningTax.splitRatesLabel')}</span>
            {rateChips.map((rate) => (
              <FilterChip
                key={rate}
                label={`${rate}%`}
                selected={pctValue === rate}
                onToggle={() => setTaxPct(String(rate))}
              />
            ))}
          </div>
        )}
        {refuses && (
          <p role="alert" className="text-xs text-warning">
            {t('miningTax.splitSameRateWarning')}
          </p>
        )}

        <div className="rounded-xs border border-line bg-panel-2">
          <div
            className={cx(
              eyebrowClassName,
              'flex items-center gap-2 border-b border-line px-2 py-1'
            )}
          >
            <span className="min-w-0 flex-1">{t('miningTax.oreColumn')}</span>
            <span className="w-24 text-right">{t('miningTax.splitKeepsColumn')}</span>
            <span className="w-24 text-right text-accent">{t('miningTax.splitMovesColumn')}</span>
          </div>
          <ul className="divide-y divide-line">
            {original.map((line) => {
              const keep = keeps.get(line.typeId) ?? line.quantity;
              const moved = Math.max(0, line.quantity - keep);
              const ore = typeNames.get(line.typeId) ?? `#${line.typeId}`;
              return (
                <li key={line.typeId} className="space-y-1.5 px-2 py-2">
                  <div className="flex items-center gap-2">
                    <OreIcon typeId={line.typeId} size={32} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      <OreLink typeId={line.typeId}>{ore}</OreLink>
                      <span className="ml-1.5 text-xs text-text-dim tabular-nums">
                        {formatCount(line.quantity)}
                      </span>
                    </span>
                    <TextInput
                      size="sm"
                      type="text"
                      inputMode="numeric"
                      aria-label={t('miningTax.splitKeepsInputLabel', {
                        ore,
                        payee: originalPayeeName,
                      })}
                      value={formatCount(keep)}
                      onChange={(e) =>
                        setKeep(line.typeId, typedUnits(e.target.value), line.quantity)
                      }
                      className={cx('w-24 text-right', keep > line.quantity && 'border-accent')}
                    />
                    <TextInput
                      size="sm"
                      type="text"
                      inputMode="numeric"
                      aria-label={t('miningTax.splitMovesInputLabel', { ore })}
                      value={moved === 0 ? '' : formatCount(moved)}
                      placeholder="0"
                      onChange={(e) =>
                        setKeep(
                          line.typeId,
                          line.quantity - Math.min(line.quantity, typedUnits(e.target.value)),
                          line.quantity
                        )
                      }
                      className={cx('w-24 text-right', moved > 0 && 'border-accent')}
                    />
                  </div>
                  <Slider
                    aria-label={t('miningTax.splitSliderLabel', { ore })}
                    min={0}
                    max={line.quantity}
                    value={moved}
                    onChange={(e) =>
                      setKeep(line.typeId, line.quantity - Number(e.target.value), line.quantity)
                    }
                  />
                  {keep > line.quantity && (
                    <p className="flex items-center gap-1.5 text-[0.6875rem] text-text-dim">
                      {t('miningTax.splitUnreportedHint', {
                        payee: originalPayeeName,
                        formatted: formatCount(keep - line.quantity),
                      })}
                      <InfoTooltip
                        label={t('miningTax.splitUtcDayLabel')}
                        content={t('miningTax.splitUtcDayTip')}
                      />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <fieldset className="space-y-1">
          <legend className={eyebrowClassName}>{t('miningTax.splitCollectorLabel')}</legend>
          {currentCollector && (
            <label
              className={`flex cursor-pointer items-start gap-2 text-xs ${tappableRowClassName}`}
            >
              <Radio
                className="mt-0.5"
                name="split-collector"
                checked={effectiveCollector === 'current'}
                disabled={claimsUnreported}
                onChange={() => setCollector('current')}
              />
              {t('miningTax.splitCollectorCurrent', { payee: currentCollectorName })}
            </label>
          )}
          <label
            className={`flex cursor-pointer items-start gap-2 text-xs ${tappableRowClassName}`}
          >
            <Radio
              className="mt-0.5"
              name="split-collector"
              checked={effectiveCollector === 'original'}
              disabled={claimsUnreported}
              onChange={() => setCollector('original')}
            />
            {t('miningTax.splitCollectorKeeps', { payee: originalPayeeName })}
          </label>
          <label
            className={`flex cursor-pointer items-start gap-2 text-xs ${tappableRowClassName}`}
          >
            <Radio
              className="mt-0.5"
              name="split-collector"
              checked={effectiveCollector === 'new'}
              onChange={() => setCollector('new')}
            />
            {t('miningTax.splitCollectorNew', {
              payee: newPayeeName || t('miningTax.splitNewSideLabel'),
            })}
          </label>
        </fieldset>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5 rounded-xs border border-line p-2">
            <p className={eyebrowClassName}>
              {t('miningTax.splitKeepsLabel', { payee: originalPayeeName })}
            </p>
            <p className="tabular-nums">
              {formatIsk(keptValue.estimatedValue)} ISK · {formatIsk(keptValue.taxOwed)} ISK{' '}
              {t('miningTax.splitAtPct', { pct: assignment.taxPct })}
            </p>
          </div>
          <div
            className={cx(
              'space-y-0.5 rounded-xs border p-2',
              movedLines.length > 0 ? 'border-accent' : 'border-line'
            )}
          >
            <p className={eyebrowClassName}>
              {t('miningTax.splitNewLabel', {
                payee: newPayeeName || t('miningTax.splitNewSideLabel'),
              })}
            </p>
            <p className="tabular-nums">
              {formatIsk(newValue.estimatedValue)} ISK · {formatIsk(newValue.taxOwed)} ISK{' '}
              {t('miningTax.splitAtPct', { pct: safePct })}
            </p>
          </div>
        </div>
        <p className="text-[0.6875rem] text-text-dim">{t('miningTax.splitRepriceHint')}</p>

        <LedgerActionError error={saveError} />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Tooltip content={!canSplit ? t('common.needsInput') : null}>
            <Button
              variant="primary"
              size="sm"
              loading={saving || busy}
              aria-disabled={!canSplit || undefined}
              onClick={() => void handleSplit()}
            >
              {movedUnits > 0
                ? t('miningTax.splitConfirmAction', { count: movedUnits })
                : t('miningTax.splitConfirmClaimAction', {
                    formatted: formatCount(unreportedUnits),
                  })}
            </Button>
          </Tooltip>
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
